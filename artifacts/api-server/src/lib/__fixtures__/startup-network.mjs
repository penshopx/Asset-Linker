// Loaded before the actual built entrypoint, only by the startup process tests.
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

function forbiddenNetwork() {
  // Fail the process even if an SDK/background worker catches the error.
  console.error("STARTUP_TEST_FORBIDDEN_NETWORK");
  process.exit(97);
}

net.Socket.prototype.connect = forbiddenNetwork;
http.request = http.get = https.request = https.get = forbiddenNetwork;
syncBuiltinESMExports();

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (
    url.origin !== "https://startup-db.example.test" ||
    method !== "POST" ||
    !["/rest/v1/rpc/run_migration", "/rest/v1/rpc/due_proof_cleanups"].includes(url.pathname)
  ) {
    forbiddenNetwork();
  }
  return Response.json(url.pathname.endsWith("/run_migration") ? null : []);
};
