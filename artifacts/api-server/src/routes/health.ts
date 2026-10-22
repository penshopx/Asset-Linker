import { Router, type IRouter } from "express";
import { HealthCheckResponse, EmailReadinessResponse } from "@workspace/api-zod";
import { getEmailReadiness } from "../lib/email-readiness";
import { getMigrationStatus } from "../lib/migrate";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", (_req, res) => {
  const readiness = getEmailReadiness();
  const migrations = getMigrationStatus();
  const status = readiness.status === "ready" && migrations === "succeeded"
    ? "ready" : "not_ready";
  res.set("Cache-Control", "no-store");
  res.status(status === "ready" ? 200 : 503)
    .json(EmailReadinessResponse.parse({
      ...readiness, status, database: { migrations },
    }));
});

export default router;
