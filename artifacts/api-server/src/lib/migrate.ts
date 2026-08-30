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
 * Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE / idempotent ALTER).
 */
const MIGRATION_SQL = `
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_email_sent  BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_error TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_delivery_state TEXT DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_retry_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_last_attempt_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_email_error TEXT DEFAULT NULL;

UPDATE orders
SET buyer_email_delivery_state = CASE
  WHEN buyer_email_sent = TRUE THEN 'sent'
  WHEN buyer_email_error IS NOT NULL THEN 'failed'
  ELSE buyer_email_delivery_state
END
WHERE buyer_email_delivery_state = 'pending';

CREATE INDEX IF NOT EXISTS orders_buyer_email_retry_idx
  ON orders (created_at, buyer_email_retry_count, buyer_email_delivery_state)
  WHERE buyer_email_sent = FALSE;

-- Remove the short-lived unique index/column added in an earlier migration attempt.
DROP INDEX  IF EXISTS orders_idempotency_key_unique;
ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;

-- ── Idempotency table ───────────────────────────────────────────────────────
-- Row-level security is enabled with NO policies, so direct anon/service-role
-- reads and writes are denied.  The SECURITY DEFINER function below is the
-- only entry point, preventing external tampering of the idempotency ledger.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT        PRIMARY KEY,
  order_id   UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Drop overly-permissive policy from earlier attempt, if present.
DROP POLICY IF EXISTS "idempotency_keys_anon_all" ON idempotency_keys;

-- ── Atomic order-creation function ─────────────────────────────────────────
-- This SECURITY DEFINER function is the single write path for both the orders
-- table and the idempotency_keys ledger.  Running both inside one transaction
-- ensures:
--   • The key is claimed and the order is created atomically — a crash between
--     the two is impossible.
--   • Expired keys are cleaned up and the slot is reused.
--   • A concurrent race (unique_violation on the key insert) rolls back the
--     entire transaction, including the order insert, so no orphan orders are
--     created.  The losing process receives the error and can retry; on retry
--     it finds the winner's key and returns their order as a duplicate.
CREATE OR REPLACE FUNCTION create_order_idempotent(
  p_idempotency_key TEXT,
  p_nama_perusahaan TEXT,
  p_nama_pic        TEXT,
  p_email           TEXT,
  p_whatsapp        TEXT,
  p_produk          TEXT,
  p_catatan         TEXT,
  p_bukti_filename  TEXT,
  p_bukti_url       TEXT
)
RETURNS TABLE(order_id UUID, is_duplicate BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_existing RECORD;
  v_ttl CONSTANT INTERVAL := '10 minutes';
BEGIN
  -- ── Idempotency check (only when a key was supplied) ──────────────────────
  IF p_idempotency_key IS NOT NULL THEN
    -- Acquire a transaction-scoped exclusive advisory lock keyed by the
    -- idempotency key before ANY read/write on idempotency_keys.
    -- This serializes ALL concurrent transactions that share the same key,
    -- including the expired-entry replacement path, so only one transaction
    -- at a time can execute the lookup → delete-if-expired → insert sequence.
    -- The lock is automatically released when this transaction ends (commit or
    -- rollback), so there is no risk of a deadlock between unrelated keys.
    PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key)::bigint);

    SELECT ik.order_id, ik.created_at
    INTO   v_existing
    FROM   idempotency_keys ik
    WHERE  ik.key = p_idempotency_key;

    IF FOUND THEN
      IF v_existing.created_at > NOW() - v_ttl THEN
        -- Non-expired duplicate: return the existing order immediately.
        RETURN QUERY SELECT v_existing.order_id, TRUE;
        RETURN;
      ELSE
        -- Expired: delete so the key slot can be reused.
        -- The advisory lock ensures no other transaction is concurrently
        -- doing the same delete/reuse, preventing duplicate orders at the
        -- TTL boundary.
        DELETE FROM idempotency_keys WHERE key = p_idempotency_key;
      END IF;
    END IF;
  END IF;

  -- ── Create the order ──────────────────────────────────────────────────────
  INSERT INTO orders(
    nama_perusahaan, nama_pic, email, whatsapp, produk,
    catatan, bukti_filename, bukti_url, status,
    buyer_email_sent, buyer_email_error
  )
  VALUES(
    p_nama_perusahaan, p_nama_pic, p_email, p_whatsapp, p_produk,
    p_catatan, p_bukti_filename, p_bukti_url, 'baru',
    FALSE, NULL
  )
  RETURNING id INTO v_order_id;

  -- ── Claim the idempotency key atomically ──────────────────────────────────
  -- This runs in the SAME transaction as the order insert above.
  -- A unique_violation here propagates to the caller and rolls back
  -- both this INSERT and the order INSERT above — no orphan orders.
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys(key, order_id)
    VALUES(p_idempotency_key, v_order_id);
  END IF;

  RETURN QUERY SELECT v_order_id, FALSE;
END;
$$;

-- ── Status history ──────────────────────────────────────────────────────────
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
