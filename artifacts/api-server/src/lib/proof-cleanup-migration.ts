/**
 * The queue is written BEFORE uploading bytes. A failed DB connection after an
 * upload therefore cannot lose the cleanup task. Deleted rows are tombstones:
 * late order RPCs must never attach a file already reserved for deletion.
 */
export const PROOF_CLEANUP_SQL = `
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
`;
