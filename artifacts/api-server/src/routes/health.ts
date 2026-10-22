import { Router, type IRouter } from "express";
import { HealthCheckResponse, EmailReadinessResponse } from "@workspace/api-zod";
import { getEmailReadiness } from "../lib/email-readiness";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", (_req, res) => {
  const readiness = getEmailReadiness();
  res.set("Cache-Control", "no-store");
  res.status(readiness.status === "ready" ? 200 : 503)
    .json(EmailReadinessResponse.parse(readiness));
});

export default router;
