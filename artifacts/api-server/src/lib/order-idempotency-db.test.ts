import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Execute the actual deployed PL/pgSQL, not a JS model of the RPC.
// A private socket and a fresh cluster keep this independent of Supabase,
// DATABASE_URL, production data, and other concurrently running DB suites.
let directory: string;
let started = false;
const env = { PATH: process.env["PATH"], LC_ALL: "C" };
function command(binary: string, args: string[]) {
  return execFileSync(binary, args, {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
  });
}
function sql(query: string) {
  return command("psql", [
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", directory, "-p", "55447", "-U", "idempotency_owner",
    "-d", "postgres", "-c", query,
  ]).trim();
}
function row<T>(query: string): T {
  return JSON.parse(sql(`SELECT row_to_json(result) FROM (${query}) result;`));
}

const bootstrap = readFileSync(new URL("../../migration.sql", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("./migrate.ts", import.meta.url), "utf8");
const runtime = runtimeSource.match(/const MIGRATION_SQL = `([\s\S]*?)`;/)?.[1];
if (!runtime) throw new Error("Cannot locate startup migration SQL for database contract tests");

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "order-idempotency-pg-"));
  command("initdb", [
    "-D", join(directory, "data"), "-A", "trust", "-U", "idempotency_owner", "--no-locale",
  ]);
  command("pg_ctl", [
    "-D", join(directory, "data"), "-l", join(directory, "postgres.log"),
    "-o", `-k ${directory} -h '' -p 55447`, "-w", "start",
  ]);
  started = true;
  sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;");
}, 30_000);

afterAll(() => {
  try {
    if (started) command("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

type RpcResult = { order_id: string; is_duplicate: boolean };
const KEY = "isolated-replay-key";
const rpc = (key: string | null, company = "PT Contract Test") => `
  SELECT * FROM create_order_idempotent(
    p_idempotency_key => ${key === null ? "NULL" : `'${key}'`},
    p_nama_perusahaan => '${company}',
    p_nama_pic => 'Test PIC', p_email => 'buyer@example.invalid',
    p_whatsapp => '08000000000', p_produk => 'Layanan A',
    p_catatan => 'Database contract', p_bukti_filename => NULL, p_bukti_url => NULL
  )
`;
function createOrder(key: string | null = KEY): RpcResult {
  // The endpoint uses Supabase's anon-key client. No direct table privileges
  // are granted here: writes must happen through SECURITY DEFINER.
  return JSON.parse(sql(`
    BEGIN;
    SET LOCAL ROLE anon;
    SELECT row_to_json(result) FROM (${rpc(key)}) result;
    COMMIT;
  `));
}
function replayAtAge(age: string): RpcResult {
  // NOW() is fixed within a transaction, so the exact TTL boundary is tested
  // without sleeps, fake JS clocks, or timing-dependent assertions.
  return JSON.parse(sql(`
    BEGIN;
    UPDATE idempotency_keys SET created_at = NOW() - INTERVAL '${age}' WHERE key = '${KEY}';
    SET LOCAL ROLE anon;
    SELECT row_to_json(result) FROM (${rpc(KEY, "Replay payload must not overwrite")}) result;
    COMMIT;
  `));
}
function ledger() {
  return row<{ key: string; order_id: string; fresh: boolean }>(`
    SELECT key, order_id, created_at > NOW() - INTERVAL '1 minute' AS fresh
    FROM idempotency_keys WHERE key = '${KEY}'
  `);
}

// The manual bootstrap installs run_migration; API startup then installs the
// order RPC. Cover both a pre-existing project and a freshly bootstrapped one.
describe.each([
  ["startup migration", runtime],
  ["manual bootstrap followed by startup", `${bootstrap}\n${runtime}`],
])("create_order_idempotent — %s", (_name, migration) => {
  beforeEach(() => {
    sql(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO anon;
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_perusahaan TEXT NOT NULL, nama_pic TEXT NOT NULL,
        email TEXT NOT NULL, whatsapp TEXT NOT NULL, produk TEXT NOT NULL,
        catatan TEXT, bukti_filename TEXT, bukti_url TEXT,
        status TEXT NOT NULL DEFAULT 'baru',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    sql(migration);
    sql(migration); // Repeated API startup must preserve the contract too.
  });

  it("creates one order and claims a new key atomically", () => {
    const result = createOrder();
    expect(result.is_duplicate).toBe(false);
    expect(result.order_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql("SELECT count(*) FROM orders;")).toBe("1");
    expect(sql("SELECT count(*) FROM idempotency_keys;")).toBe("1");
    expect(ledger()).toEqual({ key: KEY, order_id: result.order_id, fresh: true });
    expect(row(`SELECT nama_perusahaan, nama_pic, email, whatsapp, produk, catatan,
      bukti_filename, bukti_url, status, buyer_email_sent, buyer_email_error
      FROM orders WHERE id = '${result.order_id}'`)).toEqual({
      nama_perusahaan: "PT Contract Test", nama_pic: "Test PIC",
      email: "buyer@example.invalid", whatsapp: "08000000000", produk: "Layanan A",
      catatan: "Database contract", bukti_filename: null, bukti_url: null,
      status: "baru", buyer_email_sent: false, buyer_email_error: null,
    });
  });

  it("replays within ten minutes without creating or changing an order or refreshing the key", () => {
    const first = createOrder();
    expect(replayAtAge("9 minutes")).toEqual({ order_id: first.order_id, is_duplicate: true });
    expect(sql("SELECT count(*) FROM orders;")).toBe("1");
    expect(sql("SELECT count(*) FROM idempotency_keys;")).toBe("1");
    expect(ledger()).toEqual({ key: KEY, order_id: first.order_id, fresh: false });
    expect(sql(`SELECT nama_perusahaan FROM orders WHERE id = '${first.order_id}';`))
      .toBe("PT Contract Test");
  });

  it.each(["10 minutes", "11 minutes"])(
    "replaces a key aged %s with a fresh order and no stale ledger entry",
    (age) => {
      const first = createOrder();
      const replacement = replayAtAge(age);
      expect(replacement.is_duplicate).toBe(false);
      expect(replacement.order_id).not.toBe(first.order_id);
      expect(sql("SELECT count(*) FROM orders;")).toBe("2");
      expect(sql(`SELECT count(*) FROM orders WHERE id = '${first.order_id}';`)).toBe("1");
      expect(sql("SELECT count(*) FROM idempotency_keys;")).toBe("1");
      expect(sql(`SELECT count(*) FROM idempotency_keys WHERE order_id = '${first.order_id}';`)).toBe("0");
      expect(ledger()).toEqual({ key: KEY, order_id: replacement.order_id, fresh: true });
      expect(createOrder()).toEqual({ order_id: replacement.order_id, is_duplicate: true });
      expect(sql("SELECT count(*) FROM orders;")).toBe("2");
    },
  );

  it("creates independent orders without a key and leaves the ledger empty", () => {
    const first = createOrder(null);
    const second = createOrder(null);
    expect(first.is_duplicate).toBe(false);
    expect(second.is_duplicate).toBe(false);
    expect(second.order_id).not.toBe(first.order_id);
    expect(sql("SELECT count(*) FROM orders;")).toBe("2");
    expect(sql("SELECT count(*) FROM idempotency_keys;")).toBe("0");
  });
});
