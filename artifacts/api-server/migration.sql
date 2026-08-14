-- Run this once in the Supabase SQL editor to:
--   1. Create the helper function used by the API server's auto-migration.
--   2. Add the two email-tracking columns to the orders table.

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
  ADD COLUMN IF NOT EXISTS buyer_email_error TEXT    DEFAULT NULL;
