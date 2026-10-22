import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptAdminActor, encryptAdminActor } from "./admin-actor";

// Real, disposable PostgreSQL; never uses DATABASE_URL, Supabase, or user data.
// Fail explicitly if the PostgreSQL toolchain is unavailable.
let directory: string;
let started = false;
const env = { PATH: process.env["PATH"], LC_ALL: "C" };

function command(binary: string, args: string[]) {
  return execFileSync(binary, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function sql(query: string): string {
  return command("psql", [
    "-h", directory, "-p", "55445", "-U", "audit_owner", "-d", "postgres",
    "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query,
  ]).trim();
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "admin-audit-pg-"));
  command("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "audit_owner", "--no-locale"]);
  command("pg_ctl", [
    "-D", join(directory, "data"), "-l", join(directory, "postgres.log"),
    "-o", `-k ${directory} -h '' -p 55445`, "-w", "start",
  ]);
  started = true;
  sql("CREATE ROLE audit_anon NOLOGIN;");
}, 30_000);

afterAll(() => {
  if (started) command("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});
afterEach(() => vi.unstubAllEnvs());

const bootstrap = readFileSync(new URL("../../migration.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./migrate.ts", import.meta.url), "utf8")
  .match(/const MIGRATION_SQL = `([\s\S]*?)`;/)![1];

describe("anonymous database audit privacy", () => {
  it.each([["bootstrap", bootstrap], ["startup", runtime]])(
    "%s migration never exposes actor names in either anonymously-readable table",
    (_name, migration) => {
      vi.stubEnv("SESSION_SECRET", "isolated-database-test-key");
      const id = "11111111-1111-4111-8111-111111111111";
      const envelope = encryptAdminActor("Admin Rina", id);
      sql(`
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT USAGE ON SCHEMA public TO audit_anon;
        CREATE TABLE orders (
          id UUID PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'baru',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      // Verify both first application and idempotent application on old rows.
      sql(migration);
      sql(`INSERT INTO orders (id) VALUES ('${id}');`);
      sql(migration);
      sql(`
        GRANT SELECT, UPDATE ON orders TO audit_anon;
        GRANT SELECT ON status_history TO audit_anon;
        SET ROLE audit_anon;
        UPDATE orders SET status = 'diproses', status_changed_by = '${envelope}' WHERE id = '${id}';
      `);

      // SELECT * is deliberately stronger than the public API's projection.
      const anonymousDump = sql(`
        SET ROLE audit_anon;
        SELECT row_to_json(o) FROM orders o;
        SELECT row_to_json(h) FROM status_history h ORDER BY id;
      `);
      expect(anonymousDump).not.toContain("Admin Rina");
      expect(anonymousDump).toContain("enc:v1:");
      const entries = sql(`
        SET ROLE audit_anon;
        SELECT row_to_json(h) FROM status_history h ORDER BY id;
      `).split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line));
      expect(entries).toHaveLength(2);
      expect(entries[0].changed_by).toBeNull();
      expect(entries[1].changed_by).toBe(envelope);
      expect(decryptAdminActor(entries[1].changed_by, id)).toBe("Admin Rina");
      vi.stubEnv("SESSION_SECRET", "");
      expect(() => decryptAdminActor(entries[1].changed_by, id)).toThrow();

      // Database constraints also prevent accidentally reintroducing plaintext
      // into either the orders row or a history row, even by a table owner.
      expect(() => sql(`UPDATE orders SET status_changed_by = 'Admin Rina' WHERE id = '${id}';`)).toThrow();
      expect(() => sql(`UPDATE status_history SET changed_by = 'Admin Rina' WHERE order_id = '${id}';`)).toThrow();
      sql(`UPDATE orders SET status = 'diproses' WHERE id = '${id}';`);
      expect(sql(`SELECT COUNT(*) FROM status_history WHERE order_id = '${id}';`)).toBe("2");
    },
    30_000,
  );
});
