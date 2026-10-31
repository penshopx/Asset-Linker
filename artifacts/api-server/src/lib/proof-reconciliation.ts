import { getProofCleanupClient } from "./proof-cleanup-client";

export interface ReconciliationOptions {
  before: string;
  after?: string;
  limit?: number;
  enqueue?: boolean;
}

export interface ReconciliationEntry {
  filename: string;
  outcome: "candidate" | "referenced" | "tracked" | "queued";
}

/** One bounded page; report-only unless the caller explicitly opts into enqueue. */
export async function reconcileLegacyProofs(options: ReconciliationOptions) {
  const limit = options.limit ?? 100;
  const before = new Date(options.before);
  if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now() - 86_400_000) {
    throw new Error("Historical proof cutoff must be at least 24 hours old");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Page size must be an integer between 1 and 500");
  }
  const { data, error } = await getProofCleanupClient().rpc("reconcile_legacy_proofs", {
    p_before: before.toISOString(),
    p_after: options.after ?? "",
    p_limit: limit,
    p_enqueue: options.enqueue === true,
  }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row: ReconciliationEntry) =>
    !row || typeof row.filename !== "string" ||
    !["candidate", "referenced", "tracked", "queued"].includes(row.outcome))) {
    throw new Error("Invalid proof reconciliation response");
  }
  const entries = data as ReconciliationEntry[];
  return {
    entries,
    // A full page may be the last: one empty page confirms completion.
    nextCursor: entries.length === limit ? entries.at(-1)!.filename : null,
  };
}
