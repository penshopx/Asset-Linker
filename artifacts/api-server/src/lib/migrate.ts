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
