import { parseArgs } from "node:util";
import { reconcileLegacyProofs } from "./lib/proof-reconciliation";

// An explicit operator command, never part of startup or the automatic worker.
async function main() {
  const { values } = parseArgs({
    options: {
      before: { type: "string" },
      after: { type: "string", default: "" },
      "page-size": { type: "string", default: "100" },
      "max-pages": { type: "string", default: "10" },
      enqueue: { type: "boolean", default: false },
    },
  });
  if (!values.before) throw new Error("--before is required; run without --enqueue to review first");
  const maxPages = Number(values["max-pages"]);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error("--max-pages must be an integer between 1 and 100");
  }
  let cursor = values.after;
  for (let page = 1; page <= maxPages; page++) {
    const result = await reconcileLegacyProofs({
      before: values.before,
      after: cursor,
      limit: Number(values["page-size"]),
      enqueue: values.enqueue,
    });
    console.log(JSON.stringify({
      mode: values.enqueue ? "enqueue" : "report",
      before: values.before, page, ...result,
    }));
    if (result.nextCursor === null) return;
    cursor = result.nextCursor;
  }
}

main().catch((error) => {
  console.error("Proof reconciliation failed:", error instanceof Error ? error.message : "RPC failed");
  process.exitCode = 1;
});
