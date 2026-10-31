import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedPostgres } from "./__fixtures__/isolated-postgres";
import { decryptAdminIdentity, encryptVerifiedAdminActor } from "./admin-actor";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
// Only replace the HTTP transport. The real startup runner supplies the SQL,
// and the actual run_migration PL/pgSQL function executes it in PostgreSQL.
vi.mock("./proof-cleanup-client", () => ({ getProofCleanupClient: () => ({ rpc }) }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { applyMigrations, getMigrationStatus } from "./migrate";

const bootstrap = readFileSync(new URL("../../migration.sql", import.meta.url), "utf8");
const helper = readFileSync(new URL("../../migration-helper.sql", import.meta.url), "utf8");
const orderId = "00000000-0000-4000-8000-000000000066";
const rina = { id: "synthetic_rina", name: "Admin Rina", email: "rina@example.test" };
const budi = { id: "synthetic_budi", name: "Admin Budi", email: "budi@example.test" };
type History = { id: string; order_id: string; status: string; changed_at: Date; changed_by: string | null };

let cluster: Awaited<ReturnType<typeof isolatedPostgres>>;
let control: pg.Client;
let db: pg.Client;
let database: string;
let sequence = 0;

beforeAll(async () => {
  cluster = await isolatedPostgres();
  control = await cluster.connect();
}, 60_000);

afterAll(async () => { await cluster?.close(); }, 30_000);

beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "synthetic-isolated-postgres-audit-key");
  database = `audit_${++sequence}`;
  await control.query(`CREATE DATABASE ${database}`);
  db = await cluster.connect(database);
  // Pre-audit schema: legacy rows predate changed_by and must stay unknown.
  // These are synthetic fixtures, never copied from a real database.
  await db.query(`
    CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status TEXT NOT NULL DEFAULT 'baru',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      nama_perusahaan TEXT, nama_pic TEXT, email TEXT, whatsapp TEXT,
      produk TEXT, catatan TEXT, bukti_filename TEXT, bukti_url TEXT
    );
    CREATE TABLE status_history (
      id BIGSERIAL PRIMARY KEY,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO orders (id) VALUES ('${orderId}');
    INSERT INTO status_history (order_id, status, changed_at)
      VALUES ('${orderId}', 'baru', '2020-01-01T00:00:00Z');
  `);
  await db.query(helper);
  rpc.mockImplementation((name: string, { sql }: { sql: string }) => {
    expect(name).toBe("run_migration");
    return { abortSignal: async () => {
      await db.query("SELECT run_migration($1)", [sql]);
      return { error: null, status: 200 };
    } };
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (db) await cluster.disconnect(db);
  if (database) await control.query(`DROP DATABASE ${database} WITH (FORCE)`);
  vi.clearAllMocks();
});

async function migrate(source: string) {
  if (source === "manual bootstrap") {
    await db.query(bootstrap);
  } else {
    await applyMigrations();
    expect(getMigrationStatus()).toBe("succeeded");
    expect(rpc).toHaveBeenCalled();
  }
}

async function history() {
  return (await db.query<History>(
    "SELECT * FROM status_history WHERE order_id = $1 ORDER BY id", [orderId],
  )).rows;
}

async function update(client: pg.Client, status: string, admin = rina) {
  return client.query(
    "UPDATE orders SET status = $1, status_changed_by = $2 WHERE id = $3 RETURNING *",
    [status, encryptVerifiedAdminActor(admin, orderId), orderId],
  );
}

// Verify real overlap, rather than relying on Promise.all or a sleep to happen
// to race. The first transaction owns the row until the second is seen waiting.
async function waitForRowLock(pid: number) {
  const deadline = Date.now() + 4_000;
  do {
    const { rows } = await db.query(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error("Second admin never blocked on the first admin's row lock");
}

describe.each(["manual bootstrap", "runtime startup"])("%s: real PostgreSQL audit", (source) => {
  beforeEach(async () => { await migrate(source); });

  it.each([
    [rina, budi],
    [budi, rina],
  ])("keeps status/identity pairs under row-lock contention: %j then %j", async (first, second) => {
    const a = await cluster.connect(database);
    const b = await cluster.connect(database);
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      const pid = (await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await a.query("BEGIN");
      await update(a, "diproses", first);
      pending = update(b, "selesai", second);
      // Attach a rejection handler immediately, including on assertion failure.
      void pending.catch(() => {});
      await waitForRowLock(pid);
      await a.query("COMMIT");
      await pending;

      const entries = await history();
      expect(entries.map((row) => ({
        status: row.status, ...decryptAdminIdentity(row.changed_by, orderId),
      }))).toEqual([
        { status: "baru", changed_by: null, changed_by_id: null, changed_by_verified: false },
        { status: "diproses", changed_by: first.name, changed_by_id: first.id, changed_by_verified: true },
        { status: "selesai", changed_by: second.name, changed_by_id: second.id, changed_by_verified: true },
      ]);
      const final = (await db.query("SELECT * FROM orders WHERE id = $1", [orderId])).rows[0];
      expect(final.status).toBe("selesai");
      expect(decryptAdminIdentity(final.status_changed_by, orderId).changed_by_id).toBe(second.id);
    } finally {
      await a.query("ROLLBACK");
      await pending?.catch(() => {});
      await cluster.disconnect(a);
      await cluster.disconnect(b);
    }
  });

  it("rolls back both the status and actor if inserting history fails", async () => {
    await update(db, "diproses");
    const beforeOrder = (await db.query("SELECT * FROM orders WHERE id = $1", [orderId])).rows;
    const beforeHistory = await history();
    // Fail AFTER the real audit trigger inserts its row, proving that neither
    // the order update nor the partially inserted history can survive.
    await db.query(`
      CREATE FUNCTION fail_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic audit insert failure'; END; $$;
      CREATE TRIGGER test_fail_history AFTER INSERT ON status_history
        FOR EACH ROW WHEN (NEW.status = 'selesai') EXECUTE FUNCTION fail_history();
    `);
    await expect(update(db, "selesai", budi)).rejects.toMatchObject({
      code: "P0001", message: "synthetic audit insert failure",
    });
    expect((await db.query("SELECT * FROM orders WHERE id = $1", [orderId])).rows).toEqual(beforeOrder);
    expect(await history()).toEqual(beforeHistory);
  });

  it("does not add or rewrite history for the same status, even with another actor", async () => {
    await update(db, "diproses", rina);
    const before = await history();
    await update(db, "diproses", budi);
    expect(await history()).toEqual(before);
    await update(db, "selesai", budi);
    expect((await history()).map((row) => row.status)).toEqual(["baru", "diproses", "selesai"]);
  });

  it("can rerun migrations without backfilling legacy nulls or changing existing audit rows", async () => {
    await update(db, "diproses", rina);
    const before = await history();
    expect(before[0].changed_by).toBeNull();
    expect(before[0].changed_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    await migrate(source);
    await migrate(source);
    expect(await history()).toEqual(before);
    await update(db, "selesai", budi);
    const after = await history();
    expect(after.slice(0, 2)).toEqual(before);
    expect(after).toHaveLength(3); // A rerun must not duplicate the trigger.
    expect(decryptAdminIdentity(after[2].changed_by, orderId).changed_by).toBe(budi.name);
  });

  it("records a new buyer order once with an unknown actor", async () => {
    const { rows } = await db.query("INSERT INTO orders DEFAULT VALUES RETURNING id");
    const entries = (await db.query(
      "SELECT status, changed_by FROM status_history WHERE order_id = $1", [rows[0].id],
    )).rows;
    expect(entries).toEqual([{ status: "baru", changed_by: null }]);
  });
});
