-- Run this once in the Supabase SQL editor to:
--   1. Create the helper function used by the API server's auto-migration.
--   2. Add the email-tracking columns to the orders table.
--   3. Create the status_history table with RLS and an automatic trigger.

-- Step 1: helper that lets the server apply DDL via rpc()
CREATE OR REPLACE FUNCTION run_migration(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

-- Step 3: status history log (idempotent)
CREATE TABLE IF NOT EXISTS status_history (
  id         BIGSERIAL    PRIMARY KEY,
  order_id   UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT         NOT NULL,
  changed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS status_history_order_id_idx ON status_history (order_id, changed_at);

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
