import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROOF_CLEANUP_SQL } from "./proof-cleanup-migration";

const { rpc, remove, warn } = vi.hoisted(() => ({
  rpc: vi.fn(), remove: vi.fn(), warn: vi.fn(),
}));
vi.mock("./proof-cleanup-client", () => ({ getProofCleanupClient: () => ({
  rpc,
  storage: { from: () => ({ remove }) },
}) }));
vi.mock("./logger", () => ({ logger: { warn } }));

import {
  cleanupUploadedProof, registerProofUpload, retryProofCleanups,
  startProofCleanupJob, PROOF_CLEANUP_INTERVAL_MS,
} from "./proof-cleanup";

// Disposable PostgreSQL, with no access to Supabase, credentials or user data.
let directory: string;
let started = false;
const env = { PATH: process.env["PATH"], LC_ALL: "C" };
function command(binary: string, args: string[]) {
  return execFileSync(binary, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function sql(query: string) {
  return command("psql", [
    "-h", directory, "-p", "55446", "-U", "cleanup_owner", "-d", "postgres",
    "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query,
  ]).trim();
}
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "proof-cleanup-pg-"));
  command("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "cleanup_owner", "--no-locale"]);
  command("pg_ctl", [
    "-D", join(directory, "data"), "-l", join(directory, "postgres.log"),
    "-o", `-k ${directory} -h '' -p 55446`, "-w", "start",
  ]);
  started = true;
  sql(`CREATE TABLE orders (id SERIAL PRIMARY KEY);
    CREATE ROLE cleanup_anon NOLOGIN; CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE FUNCTION run_migration(sql TEXT) RETURNS VOID LANGUAGE plpgsql
      SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;`);
  sql(PROOF_CLEANUP_SQL);
  sql(PROOF_CLEANUP_SQL); // Idempotent across server starts.
}, 30_000);

afterAll(() => {
  if (started) command("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});
afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  sql("TRUNCATE orders, proof_cleanup;");
  remove.mockResolvedValue({ error: null });
  rpc.mockImplementation((name: string, params: Record<string, unknown> = {}) => ({
    abortSignal: async () => {
      const filename = quote(String(params.p_filename ?? ""));
      switch (name) {
        case "register_proof_upload":
          sql(`SET ROLE service_role; SELECT register_proof_upload(${filename});`);
          return { data: null, error: null };
        case "claim_proof_cleanup":
          return {
            data: sql(`SET ROLE service_role; SELECT claim_proof_cleanup(${filename}, ${quote(String(params.p_lease_token))}, ${params.p_force === true});`).split("\n").at(-1) === "t",
            error: null,
          };
        case "due_proof_cleanups":
          return {
            data: JSON.parse(sql("SET ROLE service_role; SELECT COALESCE(json_agg(json_build_object('filename', filename)), '[]') FROM due_proof_cleanups();").split("\n").at(-1)!),
            error: null,
          };
        case "complete_proof_cleanup":
          sql(`SET ROLE service_role; SELECT complete_proof_cleanup(${filename}, ${quote(String(params.p_lease_token))});`);
          return { data: null, error: null };
        default: throw new Error(`Unexpected RPC ${name}`);
      }
    },
  }));
});

describe("persistent proof cleanup with real PostgreSQL", () => {
  it("keeps bootstrap and runtime cleanup migrations identical", () => {
    const bootstrap = readFileSync(new URL("../../migration.sql", import.meta.url), "utf8");
    expect(bootstrap).toContain(PROOF_CLEANUP_SQL.trim());
  });

  it("retries a failed initial removal after a process restart and completes it", async () => {
    await registerProofUpload("orphan.pdf");
    remove.mockResolvedValueOnce({ error: new Error("Storage temporarily unavailable") });
    await cleanupUploadedProof("orphan.pdf");
    expect(sql("SELECT state || ':' || attempts FROM proof_cleanup;")).toBe("deleting:1");
    expect(warn).toHaveBeenCalled();
    // A lease keeps another worker from immediately duplicating the attempt.
    await retryProofCleanups();
    expect(remove).toHaveBeenCalledTimes(1);
    sql("UPDATE proof_cleanup SET next_attempt_at = NOW() - INTERVAL '1 second';");
    vi.resetModules();
    const restarted = await import("./proof-cleanup");
    await restarted.retryProofCleanups();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith(["orphan.pdf"]);
    expect(sql("SELECT state || ':' || attempts FROM proof_cleanup;")).toBe("deleted:2");
    await retryProofCleanups();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("recovers a reservation abandoned after upload without a route cleanup call", async () => {
    await registerProofUpload("crashed.pdf");
    await retryProofCleanups();
    expect(remove).not.toHaveBeenCalled();
    sql("UPDATE proof_cleanup SET next_attempt_at = NOW() - INTERVAL '1 second';");
    await retryProofCleanups();
    expect(remove).toHaveBeenCalledWith(["crashed.pdf"]);
  });

  it.each(["bukti_filename", "bukti_url"])("never removes an order's proof referenced by %s", async (column) => {
    await registerProofUpload("valid.pdf");
    const value = column === "bukti_url"
      ? "https://example.test/storage/v1/object/public/proofs/valid.pdf"
      : "valid.pdf";
    sql(`INSERT INTO orders (${column}) VALUES (${quote(value)});`);
    expect(sql("SELECT count(*) FROM proof_cleanup;")).toBe("0");
    // Also defend against a stale/legacy queue entry for an existing order.
    sql("INSERT INTO proof_cleanup(filename) VALUES ('valid.pdf');");
    await cleanupUploadedProof("valid.pdf");
    expect(remove).not.toHaveBeenCalled();
    expect(sql("SELECT count(*) FROM proof_cleanup;")).toBe("0");
  });

  it("blocks late order creation both while deletion is leased and after it succeeds", async () => {
    await registerProofUpload("late.pdf");
    expect(sql("SELECT claim_proof_cleanup('late.pdf', '11111111-1111-4111-8111-111111111111', TRUE);")).toBe("t");
    expect(() => sql("INSERT INTO orders(bukti_filename) VALUES ('late.pdf');")).toThrow();
    sql("SELECT complete_proof_cleanup('late.pdf', '11111111-1111-4111-8111-111111111111');");
    expect(() => sql("INSERT INTO orders(bukti_filename) VALUES ('late.pdf');")).toThrow();
    expect(() => sql("SELECT register_proof_upload('late.pdf');")).toThrow();
    expect(sql("SELECT count(*) FROM orders;")).toBe("0");
  });

  it("does not delete without a successful DB claim", async () => {
    await cleanupUploadedProof("unknown.pdf");
    expect(remove).not.toHaveBeenCalled();
    rpc.mockReturnValueOnce({ abortSignal: async () => ({ error: new Error("DB unavailable") }) });
    await cleanupUploadedProof("unknown.pdf");
    expect(remove).not.toHaveBeenCalled();
  });

  it("retries safely if storage succeeded but recording completion failed", async () => {
    await registerProofUpload("ack-lost.pdf");
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, params: Record<string, unknown>) =>
      name === "complete_proof_cleanup"
        ? { abortSignal: async () => ({ error: new Error("Connection lost") }) }
        : original(name, params),
    );
    await cleanupUploadedProof("ack-lost.pdf");
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleting");
    rpc.mockImplementation(original);
    sql("UPDATE proof_cleanup SET next_attempt_at = NOW() - INTERVAL '1 second';");
    await retryProofCleanups();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleted");
  });

  it("times out a stuck storage attempt so future runs can recover", async () => {
    vi.useFakeTimers();
    await registerProofUpload("stuck.pdf");
    remove.mockImplementationOnce(() => new Promise(() => {}));
    const attempt = cleanupUploadedProof("stuck.pdf");
    await vi.advanceTimersByTimeAsync(20_000);
    await attempt;
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleting");
    expect(warn).toHaveBeenCalled();
  });

  it("starts a bounded-batch worker and polls again without keeping shutdown open", async () => {
    vi.useFakeTimers();
    const timer = startProofCleanupJob();
    expect(timer.hasRef()).toBe(false);
    await vi.advanceTimersByTimeAsync(PROOF_CLEANUP_INTERVAL_MS);
    clearInterval(timer);
    expect(rpc.mock.calls.filter(([name]) => name === "due_proof_cleanups")).toHaveLength(2);
  });

  it("prevents direct anonymous queue reads and writes", () => {
    sql("GRANT SELECT, INSERT, UPDATE, DELETE ON proof_cleanup TO cleanup_anon;");
    sql("INSERT INTO proof_cleanup(filename) VALUES ('private.pdf');");
    expect(sql("SET ROLE cleanup_anon; SELECT count(*) FROM proof_cleanup;").split("\n").at(-1)).toBe("0");
    expect(() => sql("SET ROLE cleanup_anon; INSERT INTO proof_cleanup(filename) VALUES ('tamper.pdf');")).toThrow();
  });

  it.each(["cleanup_anon", "anon", "authenticated"])("denies cleanup RPC execution to %s", (role) => {
    const calls = [
      "register_proof_upload('attack.pdf')",
      "due_proof_cleanups()",
      "claim_proof_cleanup('attack.pdf', '11111111-1111-4111-8111-111111111111', TRUE)",
      "complete_proof_cleanup('attack.pdf', '11111111-1111-4111-8111-111111111111')",
      "run_migration('SELECT 1')",
    ];
    for (const call of calls) {
      expect(() => sql(`SET ROLE ${role}; SELECT ${call};`)).toThrow(/permission denied/);
    }
    expect(sql("SELECT count(*) FROM proof_cleanup;")).toBe("0");
  });

  it("rejects wrong and stale completion tokens without stopping retries", async () => {
    await registerProofUpload("lease.pdf");
    const token1 = "11111111-1111-4111-8111-111111111111";
    const token2 = "22222222-2222-4222-8222-222222222222";
    sql(`SELECT claim_proof_cleanup('lease.pdf', '${token1}', TRUE);`);
    sql(`SELECT complete_proof_cleanup('lease.pdf', '${token2}');`);
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleting");
    sql("UPDATE proof_cleanup SET next_attempt_at = NOW() - INTERVAL '1 second';");
    sql(`SELECT claim_proof_cleanup('lease.pdf', '${token2}', FALSE);`);
    sql(`SELECT complete_proof_cleanup('lease.pdf', '${token1}');`);
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleting");
    sql(`SELECT complete_proof_cleanup('lease.pdf', '${token2}');`);
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleted");
  });
});
