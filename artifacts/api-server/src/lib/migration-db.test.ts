import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Always create a private PostgreSQL cluster. Never use any configured DB URL.
const env = { PATH: process.env["PATH"], LC_ALL: "C" };
const exec = promisify(execFile);
let directory: string;
let started = false;
const bootstrap = readFileSync(new URL("../../migration.sql", import.meta.url), "utf8");
const upgrade = readFileSync(new URL("../../migration-helper.sql", import.meta.url), "utf8");
const source = readFileSync(new URL("./migrate.ts", import.meta.url), "utf8");
const cleanup = readFileSync(new URL("./proof-cleanup-migration.ts", import.meta.url), "utf8");
const runtime = source.match(/const MIGRATION_SQL = `([\s\S]*?)`;/)?.[1];
const proofSql = cleanup.match(/PROOF_CLEANUP_SQL = `([\s\S]*?)`;/)?.[1];
if (!runtime || !proofSql) throw new Error("Cannot locate actual startup SQL");
const payload = runtime + proofSql;
const helper = (text: string) => {
  const definition = text.match(/CREATE OR REPLACE FUNCTION run_migration\(sql text\)[\s\S]*?\n\$\$;/)?.[0];
  if (!definition) throw new Error("Cannot locate migration helper");
  return definition;
};
const call = (query: string) => `SELECT public.run_migration($migration$${query}$migration$);`;
function command(binary: string, args: string[]) {
  return execFileSync(binary, args, { env, encoding: "utf8", timeout: 30_000 });
}
function args(query: string) {
  return ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    "-h", directory, "-p", "55448", "-U", "migration_owner", "-d", "postgres", "-c", query];
}
function sql(query: string) {
  return execFileSync("psql", args(query), {
    env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function concurrentSql(query: string) {
  return exec("psql", args(query), { env, timeout: 20_000 });
}
async function waitForLock(waiting = false) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (sql(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'
      AND classid = 1146112850 AND objid = 1 AND granted = ${!waiting}`) !== "0") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Concurrent migration did not reach the expected lock state");
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "startup-migration-pg-"));
  command("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "migration_owner", "--no-locale"]);
  command("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"),
    "-o", `-k ${directory} -h '' -p 55448`, "-w", "start"]);
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

beforeEach(() => {
  sql(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nama_perusahaan TEXT NOT NULL, nama_pic TEXT NOT NULL,
      email TEXT NOT NULL, whatsapp TEXT NOT NULL, produk TEXT NOT NULL,
      catatan TEXT, bukti_filename TEXT, bukti_url TEXT,
      status TEXT NOT NULL DEFAULT 'baru', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
});

describe("transaction-serialized startup migrations in isolated PostgreSQL", () => {
  it("keeps bootstrap and standalone upgrade helper definitions identical", () => {
    expect(helper(bootstrap)).toBe(helper(upgrade));
  });

  it.each(["fresh helper", "upgraded legacy helper"])(
    "serializes two real startup calls with %s and leaves complete objects",
    async (mode) => {
      if (mode === "upgraded legacy helper") {
        sql(`CREATE FUNCTION run_migration(sql text) RETURNS void LANGUAGE plpgsql
          SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;`);
        const oid = sql("SELECT 'run_migration(text)'::regprocedure::oid;");
        sql(upgrade);
        expect(sql("SELECT 'run_migration(text)'::regprocedure::oid;")).toBe(oid);
      } else {
        sql(helper(bootstrap));
      }
      // First process retains its lock after the helper returns. The second
      // must wait for COMMIT, not just for EXECUTE/the function to finish.
      const first = concurrentSql(`BEGIN; ${call(payload)} SELECT pg_sleep(2); COMMIT;`);
      await waitForLock();
      const second = concurrentSql(call(payload));
      await waitForLock(true);
      await Promise.all([first, second]);
      expect(sql(`SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('orders','status_history','idempotency_keys','proof_cleanup')`)).toBe("4");
      expect(sql(`SELECT count(*) FROM pg_index WHERE NOT indisvalid`)).toBe("0");
      expect(sql(`SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_status_history'
        AND tgrelid = 'orders'::regclass`)).toBe("1");
      expect(sql(`SELECT count(*) FROM pg_policies WHERE tablename = 'status_history'
        AND policyname = 'status_history_anon_select'`)).toBe("1");
      expect(sql(`SELECT count(*) FROM pg_constraint WHERE conname IN
        ('orders_actor_encrypted','history_actor_encrypted')`)).toBe("2");
      sql(`INSERT INTO orders(nama_perusahaan,nama_pic,email,whatsapp,produk)
        VALUES('Test','PIC','test@example.invalid','0800','LKUT')`);
      expect(sql("SELECT count(*) FROM status_history")).toBe("1");
      // A subsequent invocation is still idempotent and locks are released.
      sql(call(payload));
      expect(sql("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'")).toBe("0");
    }, 15_000,
  );

  it("bounds a contended lock wait, applies no partial DDL, and can recover", async () => {
    sql(upgrade);
    const holder = concurrentSql("BEGIN; SELECT pg_advisory_xact_lock(1146112850,1); SELECT pg_sleep(7); COMMIT;");
    await waitForLock();
    const start = Date.now();
    const error = await concurrentSql(call("CREATE TABLE should_not_exist(id INT)"))
      .then(() => { throw new Error("Expected lock timeout"); }, (failure: unknown) => failure);
    expect(String((error as { stderr: string }).stderr)).toContain("55P03");
    expect(Date.now() - start).toBeGreaterThanOrEqual(4_500);
    expect(Date.now() - start).toBeLessThan(6_500);
    expect(sql("SELECT to_regclass('should_not_exist') IS NULL")).toBe("t");
    await holder;
    sql(call("CREATE TABLE should_not_exist(id INT)"));
    expect(sql("SELECT to_regclass('should_not_exist') IS NOT NULL")).toBe("t");
    // Function-local timeout does not leak into later session work.
    expect(sql(`SET lock_timeout = '9s'; ${call("SELECT 1")} SHOW lock_timeout`)).toBe("9s");
  }, 15_000);

  it("rolls back DDL and releases the lock on SQL failure", () => {
    sql(upgrade);
    expect(() => sql(call("CREATE TABLE partial_object(id INT); SELECT missing_column;"))).toThrow();
    expect(sql("SELECT to_regclass('partial_object') IS NULL")).toBe("t");
    expect(sql("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'")).toBe("0");
    sql(call("CREATE TABLE partial_object(id INT)"));
  });

  it("keeps arbitrary migration SQL restricted to the server role after upgrade", () => {
    sql(upgrade);
    for (const role of ["anon", "authenticated"]) {
      expect(sql(`SELECT has_function_privilege('${role}', 'run_migration(text)', 'EXECUTE')`)).toBe("f");
    }
    expect(sql("SELECT has_function_privilege('service_role', 'run_migration(text)', 'EXECUTE')")).toBe("t");
    sql(`SET ROLE service_role; ${call("CREATE TABLE service_migrated(id INT)")}`);
    expect(sql("SELECT to_regclass('service_migrated') IS NOT NULL")).toBe("t");
  });
});
