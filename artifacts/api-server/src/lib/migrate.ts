/**
 * Lightweight startup migration runner.
 *
 * Supabase's JS client (anon key) cannot execute DDL directly.  Instead we
 * call a Postgres function `run_migration(sql text)` that must be created
 * once in the Supabase SQL editor (see migration.sql).  If the function is
 * absent the server still boots and logs a clear warning.
 */

import { supabase } from "./supabase";

/**
 * SQL that must be applied to the database exactly once.
 * Safe to re-run (uses IF NOT EXISTS / idempotent ALTER).
 */
const MIGRATION_SQL = `
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_email_sent  BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_error TEXT    DEFAULT NULL;

CREATE TABLE IF NOT EXISTS status_history (
  id         BIGSERIAL    PRIMARY KEY,
  order_id   UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT         NOT NULL,
  changed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS status_history_order_id_idx ON status_history (order_id, changed_at);

ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'status_history' AND policyname = 'status_history_anon_select'
  ) THEN
    CREATE POLICY "status_history_anon_select"
      ON status_history FOR SELECT USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION record_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO status_history (order_id, status) VALUES (NEW.id, NEW.status);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO status_history (order_id, status) VALUES (NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'orders_status_history'
      AND tgrelid = 'orders'::regclass
  ) THEN
    CREATE TRIGGER orders_status_history
      AFTER INSERT OR UPDATE OF status ON orders
      FOR EACH ROW EXECUTE FUNCTION record_status_history();
  END IF;
END $$;
`;

export async function applyMigrations(): Promise<void> {
  // Try the helper RPC that the SQL editor script creates.
  const { error } = await supabase.rpc("run_migration", { sql: MIGRATION_SQL });

  if (error) {
    if ((error as any).code === "PGRST202" || error.message?.includes("run_migration")) {
      // Function doesn't exist yet — print the SQL so the operator can run it manually.
      console.warn(
        "[migrate] ⚠️  Could not apply migrations automatically.\n" +
          "Run the following SQL in the Supabase SQL editor:\n" +
          MIGRATION_SQL.trim()
      );
    } else {
      // Unexpected error — still non-fatal, but log it clearly.
      console.error("[migrate] Migration error (non-fatal):", error.message);
    }
  } else {
    console.log("[migrate] ✅ Migrations applied successfully.");
  }
}
