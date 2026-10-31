-- Upgrade only the helper on an existing database; no application data changes.
-- Requires explicit operator approval for production.
-- Pause/drain API replicas first: in-flight calls to the old helper do not lock.
-- Run this entire file as the database owner in the Supabase SQL editor, then
-- resume replicas. CREATE OR REPLACE preserves the function identity and grants.
-- Never send this upgrade through the old run_migration RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';

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

REVOKE ALL ON FUNCTION run_migration(TEXT) FROM PUBLIC;
DO $$
DECLARE v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION run_migration(TEXT) FROM %I', v_role);
      IF v_role = 'service_role' THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION run_migration(TEXT) TO %I', v_role);
      END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;
