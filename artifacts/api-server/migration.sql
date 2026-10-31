-- Run this once in the Supabase SQL editor to:
--   1. Create the helper function used by the API server's auto-migration.
--   2. Add the email-tracking columns to the orders table.
--   3. Create the status_history table with RLS and an automatic trigger.

-- Step 1: helper that lets the server apply DDL via rpc()
-- Existing installations: pause API replicas, apply migration-helper.sql as the
-- database owner, then resume replicas. Do not upgrade via the old unlocked RPC.
CREATE OR REPLACE FUNCTION run_migration(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
AS $$
BEGIN
  -- Dedicated two-int namespace, distinct from per-order bigint locks.
  -- Held until transaction commit/rollback, not merely until EXECUTE returns.
  PERFORM pg_advisory_xact_lock(1146112850, 1);
  EXECUTE sql;
END;
$$;

-- Step 2: add email-status columns (idempotent)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_email_sent  BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_error TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_delivery_state TEXT DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_retry_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_email_last_attempt_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_email_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status_changed_by TEXT DEFAULT NULL;

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

-- Step 3: status history log (idempotent)
CREATE TABLE IF NOT EXISTS status_history (
  id         BIGSERIAL    PRIMARY KEY,
  order_id   UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT         NOT NULL,
  changed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS status_history_order_id_idx ON status_history (order_id, changed_at);

-- Nullable for legacy rows and the initial, buyer-created status.
ALTER TABLE status_history ADD COLUMN IF NOT EXISTS changed_by TEXT DEFAULT NULL;

-- Actor columns contain AES-GCM envelopes only, never plaintext names.
-- The anon-key database client can read envelopes, but only the admin API
-- has the server-held SESSION_SECRET required to decrypt them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_actor_encrypted' AND conrelid = 'orders'::regclass) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_actor_encrypted
      CHECK (status_changed_by IS NULL OR status_changed_by ~ '^enc:v1:[A-Za-z0-9+/=]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'history_actor_encrypted' AND conrelid = 'status_history'::regclass) THEN
    ALTER TABLE status_history ADD CONSTRAINT history_actor_encrypted
      CHECK (changed_by IS NULL OR changed_by ~ '^enc:v1:[A-Za-z0-9+/=]+$');
  END IF;
END $$;

-- Persistent proof cleanup (keep in sync with src/lib/proof-cleanup-migration.ts).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bukti_filename TEXT,
  ADD COLUMN IF NOT EXISTS bukti_url TEXT;

CREATE TABLE IF NOT EXISTS proof_cleanup (
  filename TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'deleting', 'deleted')),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token UUID
);
ALTER TABLE proof_cleanup ADD COLUMN IF NOT EXISTS lease_token UUID;
ALTER TABLE proof_cleanup ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS proof_cleanup_due_idx ON proof_cleanup(next_attempt_at)
  WHERE state <> 'deleted';

CREATE OR REPLACE FUNCTION register_proof_upload(p_filename TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Collisions must fail, never overwrite a reservation or a tombstone.
  INSERT INTO proof_cleanup(filename) VALUES (p_filename);
END;
$$;

CREATE OR REPLACE FUNCTION guard_order_proof()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_filename TEXT;
  v_state TEXT;
BEGIN
  -- Protect both representations, including legacy URL-only orders. Acquire in
  -- sorted order so changing two different references cannot deadlock.
  FOR v_filename IN
    SELECT DISTINCT name FROM unnest(ARRAY[
      NEW.bukti_filename,
      split_part(split_part(NEW.bukti_url, '/storage/v1/object/public/proofs/', 2), '?', 1)
    ]) AS names(name) WHERE name IS NOT NULL AND name <> '' ORDER BY name
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('proof:' || v_filename)::bigint);
    SELECT state INTO v_state FROM proof_cleanup WHERE filename = v_filename FOR UPDATE;
    IF v_state IN ('deleting', 'deleted') THEN
      RAISE EXCEPTION 'Proof is reserved for cleanup' USING ERRCODE = '23514';
    END IF;
    DELETE FROM proof_cleanup WHERE filename = v_filename AND state = 'pending';
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_proof ON orders;
CREATE TRIGGER orders_guard_proof
  BEFORE INSERT OR UPDATE OF bukti_filename, bukti_url ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_proof();

DROP FUNCTION IF EXISTS claim_proof_cleanup(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS complete_proof_cleanup(TEXT);

CREATE OR REPLACE FUNCTION claim_proof_cleanup(p_filename TEXT, p_lease_token UUID, p_force BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job proof_cleanup%ROWTYPE;
BEGIN
  IF p_lease_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('proof:' || p_filename)::bigint);
  SELECT * INTO v_job FROM proof_cleanup WHERE filename = p_filename FOR UPDATE;
  IF NOT FOUND OR v_job.state = 'deleted' THEN RETURN FALSE; END IF;
  -- Never force an already claimed lease: another process may be removing it.
  IF v_job.next_attempt_at > NOW() AND (NOT p_force OR v_job.state = 'deleting') THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders WHERE bukti_filename = p_filename
      OR split_part(split_part(bukti_url, '/storage/v1/object/public/proofs/', 2), '?', 1) = p_filename
  ) THEN
    DELETE FROM proof_cleanup WHERE filename = p_filename;
    RETURN FALSE;
  END IF;
  UPDATE proof_cleanup SET state = 'deleting', attempts = attempts + 1,
    lease_token = p_lease_token,
    next_attempt_at = NOW() + INTERVAL '5 minutes' WHERE filename = p_filename;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION due_proof_cleanups()
RETURNS TABLE(filename TEXT) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT filename FROM proof_cleanup WHERE state <> 'deleted' AND next_attempt_at <= NOW()
  ORDER BY next_attempt_at, filename LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION complete_proof_cleanup(p_filename TEXT, p_lease_token UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE proof_cleanup SET state = 'deleted', lease_token = NULL
    WHERE filename = p_filename AND state = 'deleting' AND lease_token = p_lease_token;
$$;

-- RLS does not restrict SECURITY DEFINER RPCs. Only the server credential may
-- execute these functions, never the publicly usable anon/authenticated roles.
DO $$
DECLARE v_role TEXT; v_function TEXT;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'register_proof_upload(TEXT)', 'claim_proof_cleanup(TEXT, UUID, BOOLEAN)',
    'complete_proof_cleanup(TEXT, UUID)', 'due_proof_cleanups()', 'run_migration(TEXT)'
  ] LOOP
    IF to_regprocedure(v_function) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
      FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_function, v_role);
          IF v_role = 'service_role' THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_function, v_role);
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Row Level Security: anon key can read but not write directly.
-- Writes happen exclusively via the DB trigger below (no RPC or direct INSERT needed).
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

-- Step 4: trigger function that records a row whenever orders.status changes.
-- SECURITY DEFINER so it runs as the table owner and can bypass RLS on status_history.
CREATE OR REPLACE FUNCTION record_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO status_history (order_id, status) VALUES (NEW.id, NEW.status);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO status_history (order_id, status, changed_by)
      VALUES (NEW.id, NEW.status, NEW.status_changed_by);
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
