import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { Client, type QueryResult } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROOF_CLEANUP_SQL } from "./proof-cleanup-migration";
import { reconcileLegacyProofs } from "./proof-reconciliation";

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
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (
      bucket_id TEXT NOT NULL, name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
      updated_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
      PRIMARY KEY(bucket_id, name)
    );
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
  sql("TRUNCATE orders, proof_cleanup, storage.objects;");
  remove.mockResolvedValue({ error: null });
  rpc.mockImplementation((name: string, params: Record<string, unknown> = {}) => ({
    abortSignal: async () => {
      const filename = quote(String(params.p_filename ?? ""));
      switch (name) {
        case "reconcile_legacy_proofs":
          return {
            data: JSON.parse(sql(`SET ROLE service_role; SELECT COALESCE(jsonb_agg(r), '[]')
              FROM reconcile_legacy_proofs(${quote(String(params.p_before))},
                ${quote(String(params.p_after))}, ${Number(params.p_limit)}, ${params.p_enqueue === true}) r;`).split("\n").at(-1)!),
            error: null,
          };
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
      "reconcile_legacy_proofs(NOW() - INTERVAL '2 days')",
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

describe("concurrent proof cleanup with independent PostgreSQL connections", () => {
  const token1 = "11111111-1111-4111-8111-111111111111";
  const token2 = "22222222-2222-4222-8222-222222222222";
  let winner: Client;
  let contender: Client;
  let winnerPid: number;
  let contenderPid: number;

  beforeEach(async () => {
    const options = {
      host: directory, port: 55446, user: "cleanup_owner", database: "postgres",
      // Bounds are failure guards, never synchronization delays.
      statement_timeout: 8_000,
    };
    winner = new Client(options);
    contender = new Client(options);
    await Promise.all([winner.connect(), contender.connect()]);
    winnerPid = (await winner.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    contenderPid = (await contender.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    expect(winnerPid).not.toBe(contenderPid);
    await Promise.all([
      winner.query("BEGIN ISOLATION LEVEL READ COMMITTED"),
      contender.query("BEGIN ISOLATION LEVEL READ COMMITTED"),
    ]);
  });

  afterEach(async () => {
    // Release the blocker first, including on assertion failure, then drain the
    // contender's transaction before closing either connection.
    try {
      await winner?.query("ROLLBACK");
      await contender?.query("ROLLBACK");
    } finally {
      await Promise.all([winner?.end(), contender?.end()]);
    }
  });

  function pending(query: Promise<QueryResult>) {
    // Attach a rejection handler immediately: the losing order is expected to
    // fail, but only after we have observed its actual PostgreSQL lock wait.
    return query.then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error }),
    );
  }

  async function waitForContention() {
    const deadline = performance.now() + 4_000;
    while (performance.now() < deadline) {
      const { rows } = await winner.query(
        "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked",
        [winnerPid, contenderPid],
      );
      if (rows[0].blocked) return;
      await setImmediate();
    }
    throw new Error("Contender never blocked on the winning PostgreSQL transaction");
  }

  const orderCases = [
    { operation: "insert", column: "bukti_filename" },
    { operation: "insert", column: "bukti_url" },
    { operation: "update", column: "bukti_filename" },
    { operation: "update", column: "bukti_url" },
  ] as const;

  function orderWrite(operation: "insert" | "update", column: string) {
    const filename = "concurrent.pdf";
    sql(`SELECT register_proof_upload('${filename}');`);
    const id = operation === "update"
      ? Number(sql("INSERT INTO orders DEFAULT VALUES RETURNING id;").split("\n")[0])
      : undefined;
    const value = column === "bukti_url"
      ? `https://example.test/storage/v1/object/public/proofs/${filename}?download=1`
      : filename;
    return {
      filename, value,
      query: operation === "insert"
        ? `INSERT INTO orders(${column}) VALUES ($1)`
        : `UPDATE orders SET ${column} = $1 WHERE id = ${id}`,
    };
  }

  it.each(orderCases)(
    "protects the proof when order $operation via $column commits before the waiting claim",
    async ({ operation, column }) => {
      const write = orderWrite(operation, column);
      await winner.query(write.query, [write.value]);
      const claim = pending(contender.query(
        "SELECT claim_proof_cleanup($1, $2, TRUE) AS claimed", [write.filename, token1],
      ));
      await waitForContention();
      await winner.query("COMMIT");
      const outcome = await claim;
      expect(outcome.error).toBeUndefined();
      expect(outcome.result?.rows).toEqual([{ claimed: false }]);
      await contender.query("COMMIT");
      expect(sql("SELECT count(*) FROM orders WHERE " + column + " IS NOT NULL;")).toBe("1");
      expect(sql("SELECT count(*) FROM proof_cleanup;")).toBe("0");
    },
  );

  it.each(orderCases)(
    "rejects the waiting order $operation via $column when the cleanup claim commits first",
    async ({ operation, column }) => {
      const write = orderWrite(operation, column);
      const claim = await winner.query(
        "SELECT claim_proof_cleanup($1, $2, TRUE) AS claimed", [write.filename, token1],
      );
      expect(claim.rows).toEqual([{ claimed: true }]);
      const order = pending(contender.query(write.query, [write.value]));
      await waitForContention();
      await winner.query("COMMIT");
      const outcome = await order;
      expect(outcome.error).toMatchObject({
        code: "23514", message: "Proof is reserved for cleanup",
      });
      await contender.query("ROLLBACK");
      expect(sql("SELECT count(*) FROM orders WHERE bukti_filename IS NOT NULL OR bukti_url IS NOT NULL;")).toBe("0");
      expect(sql("SELECT count(*) FROM orders;")).toBe(operation === "update" ? "1" : "0");
      expect(sql("SELECT state || ':' || lease_token || ':' || attempts FROM proof_cleanup;"))
        .toBe(`deleting:${token1}:1`);
    },
  );

  it("gives only one worker the active lease and recovers it with a new token after expiry", async () => {
    sql("SELECT register_proof_upload('workers.pdf');");
    expect((await winner.query(
      "SELECT claim_proof_cleanup('workers.pdf', $1, TRUE) AS claimed", [token1],
    )).rows).toEqual([{ claimed: true }]);
    // Force must not steal an active lease, even after waiting for its commit.
    const competingClaim = pending(contender.query(
      "SELECT claim_proof_cleanup('workers.pdf', $1, TRUE) AS claimed", [token2],
    ));
    await waitForContention();
    await winner.query("COMMIT");
    const outcome = await competingClaim;
    expect(outcome.error).toBeUndefined();
    expect(outcome.result?.rows).toEqual([{ claimed: false }]);
    await contender.query("COMMIT");
    expect(sql("SELECT lease_token || ':' || attempts FROM proof_cleanup;")).toBe(`${token1}:1`);

    // Expire persisted state explicitly; no clock advance or sleep is needed.
    await winner.query("UPDATE proof_cleanup SET next_attempt_at = '-infinity';");
    expect((await contender.query(
      "SELECT claim_proof_cleanup('workers.pdf', $1, FALSE) AS claimed", [token2],
    )).rows).toEqual([{ claimed: true }]);
    expect(sql("SELECT state || ':' || lease_token || ':' || attempts FROM proof_cleanup;"))
      .toBe(`deleting:${token2}:2`);
    expect((await winner.query(
      "SELECT claim_proof_cleanup('workers.pdf', $1, TRUE) AS claimed", [token1],
    )).rows).toEqual([{ claimed: false }]);
    await winner.query("SELECT complete_proof_cleanup('workers.pdf', $1);", [token1]);
    expect(sql("SELECT state || ':' || lease_token FROM proof_cleanup;")).toBe(`deleting:${token2}`);
    await contender.query("SELECT complete_proof_cleanup('workers.pdf', $1);", [token2]);
    expect(sql("SELECT state FROM proof_cleanup;")).toBe("deleted");
  });
});

describe("historical proof reconciliation", () => {
  const before = () => new Date(Date.now() - 2 * 86_400_000).toISOString();

  it("reports nested files across pages without touching the queue or storage", async () => {
    sql(`INSERT INTO storage.objects(bucket_id, name) VALUES
      ('proofs', 'a.pdf'), ('proofs', 'folder/b.pdf'), ('proofs', 'z.pdf'),
      ('other-bucket', 'private.pdf');
      INSERT INTO storage.objects(bucket_id, name, created_at, updated_at) VALUES
      ('proofs', 'new.pdf', NOW(), NOW()),
      ('proofs', 'recently-replaced.pdf', NOW() - INTERVAL '7 days', NOW()),
      ('proofs', 'unknown-date.pdf', NULL, NULL);`);
    const first = await reconcileLegacyProofs({ before: before(), limit: 2 });
    expect(first.entries).toEqual([
      { filename: "a.pdf", outcome: "candidate" },
      { filename: "folder/b.pdf", outcome: "candidate" },
    ]);
    expect(first.nextCursor).toBe("folder/b.pdf");
    const last = await reconcileLegacyProofs({
      before: before(), limit: 2, after: first.nextCursor!,
    });
    expect(last.entries).toEqual([{ filename: "z.pdf", outcome: "candidate" }]);
    expect(last.nextCursor).toBeNull();
    expect(sql("SELECT count(*) FROM proof_cleanup;")).toBe("0");
    expect(remove).not.toHaveBeenCalled();
  });

  it("protects filename and legacy URL references while queuing only orphan files", async () => {
    sql(`INSERT INTO storage.objects(bucket_id, name) VALUES
      ('proofs', 'filename.pdf'), ('proofs', 'folder/url.pdf'), ('proofs', 'orphan.pdf');
      INSERT INTO orders(bukti_filename) VALUES ('filename.pdf');
      INSERT INTO orders(bukti_url) VALUES
      ('https://example.test/storage/v1/object/public/proofs/folder/url.pdf?download=1');`);
    const report = await reconcileLegacyProofs({ before: before(), enqueue: true });
    expect(report.entries).toEqual([
      { filename: "filename.pdf", outcome: "referenced" },
      { filename: "folder/url.pdf", outcome: "referenced" },
      { filename: "orphan.pdf", outcome: "queued" },
    ]);
    expect(remove).not.toHaveBeenCalled(); // Discovery never deletes directly.
    expect(sql("SELECT filename FROM proof_cleanup;")).toBe("orphan.pdf");
    await retryProofCleanups();
    expect(remove).toHaveBeenCalledExactlyOnceWith(["orphan.pdf"]);
    const again = await reconcileLegacyProofs({ before: before(), enqueue: true });
    expect(again.entries.at(-1)?.outcome).toBe("tracked");
    expect(sql("SELECT state || ':' || attempts FROM proof_cleanup;")).toBe("deleted:1");
  });

  it("does not skip later pages when objects from earlier pages disappear", async () => {
    sql(`INSERT INTO storage.objects(bucket_id, name) VALUES
      ('proofs', 'a.pdf'), ('proofs', 'b.pdf'), ('proofs', 'c.pdf'), ('proofs', 'd.pdf');`);
    const first = await reconcileLegacyProofs({ before: before(), limit: 2, enqueue: true });
    sql("DELETE FROM storage.objects WHERE name IN ('a.pdf', 'b.pdf');");
    const second = await reconcileLegacyProofs({
      before: before(), after: first.nextCursor!, limit: 2, enqueue: true,
    });
    expect(second.entries.map((entry) => entry.filename)).toEqual(["c.pdf", "d.pdf"]);
    expect(second.nextCursor).toBe("d.pdf");
    const end = await reconcileLegacyProofs({ before: before(), after: second.nextCursor!, limit: 2 });
    expect(end).toEqual({ entries: [], nextCursor: null });
  });

  it("rechecks references after the report and after enqueue, before removal", async () => {
    sql("INSERT INTO storage.objects(bucket_id, name) VALUES ('proofs', 'late-order.pdf');");
    expect((await reconcileLegacyProofs({ before: before() })).entries[0]?.outcome).toBe("candidate");
    sql("INSERT INTO orders(bukti_filename) VALUES ('late-order.pdf');");
    expect((await reconcileLegacyProofs({ before: before(), enqueue: true })).entries[0]?.outcome).toBe("referenced");
    sql("DELETE FROM orders;");
    await reconcileLegacyProofs({ before: before(), enqueue: true });
    sql("INSERT INTO orders(bukti_filename) VALUES ('late-order.pdf');");
    await retryProofCleanups();
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves existing reservations, leases and tombstones", async () => {
    sql(`INSERT INTO storage.objects(bucket_id, name) VALUES
      ('proofs', 'pending.pdf'), ('proofs', 'leased.pdf'), ('proofs', 'deleted.pdf');
      INSERT INTO proof_cleanup(filename, state, attempts) VALUES
      ('pending.pdf', 'pending', 0), ('leased.pdf', 'deleting', 3), ('deleted.pdf', 'deleted', 1);`);
    const snapshot = sql("SELECT json_agg(q ORDER BY filename) FROM proof_cleanup q;");
    const result = await reconcileLegacyProofs({ before: before(), enqueue: true });
    expect(result.entries.every((entry) => entry.outcome === "tracked")).toBe(true);
    expect(sql("SELECT json_agg(q ORDER BY filename) FROM proof_cleanup q;")).toBe(snapshot);
  });

  it("rejects unsafe cutoffs and unbounded pages at both boundaries", async () => {
    for (const cutoff of [new Date().toISOString(), "not-a-date"]) {
      await expect(reconcileLegacyProofs({ before: cutoff })).rejects.toThrow(/cutoff/);
    }
    for (const limit of [0, 501, 1.5]) {
      await expect(reconcileLegacyProofs({ before: before(), limit })).rejects.toThrow(/Page size/);
    }
    for (const args of [
      "NOW()", "'infinity'", "NULL",
      "NOW() - INTERVAL '2 days', '', 0",
      "NOW() - INTERVAL '2 days', '', 501",
      "NOW() - INTERVAL '2 days', NULL",
    ]) {
      expect(() => sql(`SELECT * FROM reconcile_legacy_proofs(${args});`)).toThrow();
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("fails explicitly if discovery cannot access the database", async () => {
    rpc.mockReturnValueOnce({ abortSignal: async () => ({ error: new Error("DB unavailable") }) });
    await expect(reconcileLegacyProofs({ before: before() })).rejects.toThrow("DB unavailable");
    expect(remove).not.toHaveBeenCalled();
  });
});
