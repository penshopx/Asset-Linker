import app from "./app";
import { logger } from "./lib/logger";
import { applyMigrations } from "./lib/migrate";
import { startBuyerEmailRetryJob } from "./lib/buyer-email-retry";
import { validateEmailStartup } from "./lib/email-readiness";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

validateEmailStartup();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Keep serving health checks and requests while migrations recover.
  void applyMigrations().catch((err: unknown) => {
    logger.error({ err }, "[migrate] Unexpected migration runner failure (non-fatal)");
  });
  startBuyerEmailRetryJob();
});
