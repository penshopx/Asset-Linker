import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Never fall back to the publicly usable anon identity for cleanup operations. */
export function getProofCleanupClient(): SupabaseClient {
  if (client) return client;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("Proof cleanup requires SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
