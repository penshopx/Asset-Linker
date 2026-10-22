import { randomUUID } from "node:crypto";
import { getProofCleanupClient } from "./proof-cleanup-client";
import { logger } from "./logger";

export const PROOF_CLEANUP_INTERVAL_MS = 60_000;
const RPC_TIMEOUT_MS = 15_000;

async function withStorageTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Proof storage cleanup timed out")), 20_000);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Do not upload bytes unless a persistent cleanup reservation exists.
export async function registerProofUpload(filename: string): Promise<void> {
  const supabase = getProofCleanupClient();
  const { error } = await supabase.rpc("register_proof_upload", { p_filename: filename })
    .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  if (error) throw error;
}

export async function cleanupUploadedProof(
  filename: string | null,
  force = true,
): Promise<void> {
  if (!filename) return;
  try {
    const supabase = getProofCleanupClient();
    const leaseToken = randomUUID();
    const { data: claimed, error: claimError } = await supabase.rpc("claim_proof_cleanup", {
      p_filename: filename,
      p_force: force,
      p_lease_token: leaseToken,
    }).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (claimError) throw claimError;
    // A missing reservation, active lease or order reference is not permission
    // to delete. The SQL guard prevents new references after a successful claim.
    if (claimed !== true) return;
    const { error } = await withStorageTimeout(supabase.storage.from("proofs").remove([filename]));
    if (error) throw error;
    const { error: completeError } = await supabase.rpc("complete_proof_cleanup", {
      p_filename: filename,
      p_lease_token: leaseToken,
    }).abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (completeError) throw completeError;
  } catch (error) {
    // The durable reservation remains due after its lease. No retry cap:
    // temporary DB/storage outages and process crashes must not abandon files.
    logger.warn({ err: error, filename }, "Proof cleanup deferred for persistent retry");
  }
}

export async function retryProofCleanups(): Promise<void> {
  const supabase = getProofCleanupClient();
  const { data, error } = await supabase.rpc("due_proof_cleanups")
    .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  if (error) throw error;
  for (const job of data ?? []) {
    await cleanupUploadedProof(job.filename, false);
  }
}

export function startProofCleanupJob(): NodeJS.Timeout {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await retryProofCleanups();
    } catch (error) {
      logger.warn({ err: error }, "Proof cleanup worker will retry");
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), PROOF_CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
