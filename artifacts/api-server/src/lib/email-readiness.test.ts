import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("./logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("./proof-cleanup-client", () => ({
  getProofCleanupClient: () => ({
    rpc: () => ({ abortSignal: async () => ({ error: null, status: 200 }) }),
  }),
}));

import { logger } from "./logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", "fake-key-not-secret");
  vi.stubEnv("SITE_URL", "https://preview.example.test/");
  vi.stubEnv("NODE_ENV", "production");
});

describe("email startup configuration", () => {
  it.each([
    "", " ", "not-a-url", "https://", "https:example.test",
    "ftp://example.test", "https://user:password@example.test",
    "https://example.test?token=secret", "https://example.test#secret",
  ])("rejects invalid base URL %s without logging the supplied value", async (url) => {
    vi.stubEnv("SITE_URL", url);
    const { validateEmailStartup, getEmailReadiness } = await import("./email-readiness");
    validateEmailStartup();
    expect(getEmailReadiness()).toMatchObject({
      status: "not_ready", email: { links: "invalid", provider: "unchecked" },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "production",
        requiredUrlFormat: expect.stringContaining("http:// or https://"),
      }),
      expect.stringContaining("SITE_URL"),
    );
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain("password");
    expect(logged).not.toContain("token=secret");
    expect(logged).not.toContain("fake-key-not-secret");
  });

  it.each(["http://localhost:5000/", "https://preview.example.test/app/"])(
    "accepts %s without claiming the provider was probed",
    async (url) => {
      vi.stubEnv("SITE_URL", url);
      const { validateEmailStartup, getEmailReadiness, validateSiteUrl } =
        await import("./email-readiness");
      validateEmailStartup();
      expect(validateSiteUrl()).toBe(url.replace(/\/+$/, ""));
      expect(getEmailReadiness()).toMatchObject({
        status: "ready", email: { links: "valid", provider: "unchecked" },
      });
      expect(logger.info).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it("does not require SITE_URL if email is disabled", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SITE_URL", undefined);
    const { validateEmailStartup, getEmailReadiness } = await import("./email-readiness");
    validateEmailStartup();
    expect(getEmailReadiness()).toEqual({
      status: "ready",
      email: { enabled: false, links: "not_required", provider: "not_configured" },
    });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reports a missing URL in development at startup", async () => {
    vi.stubEnv("SITE_URL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const { validateEmailStartup } = await import("./email-readiness");
    validateEmailStartup();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "development" }), expect.any(String),
    );
  });
});

it("keeps liveness healthy and distinguishes configuration from last-send failures", async () => {
  const { default: router } = await import("../routes/health");
  const { applyMigrations } = await import("./migrate");
  await applyMigrations();
  const { recordEmailSend } = await import("./email-readiness");
  const app = express().use("/api", router);
  await request(app).get("/api/readyz").expect(200);
  vi.stubEnv("SITE_URL", "");
  let response = await request(app).get("/api/readyz").expect(503);
  expect(response.body.email).toMatchObject({ links: "invalid", provider: "unchecked" });
  await request(app).get("/api/healthz").expect(200, { status: "ok" });
  vi.stubEnv("SITE_URL", "https://example.test");
  recordEmailSend(false);
  response = await request(app).get("/api/readyz").expect(503);
  expect(response.body.email).toMatchObject({ links: "valid", provider: "unavailable" });
  expect(response.headers["cache-control"]).toBe("no-store");
  recordEmailSend(true);
  await request(app).get("/api/readyz").expect(200);
  vi.stubEnv("RESEND_API_KEY", "");
  response = await request(app).get("/api/readyz").expect(200);
  expect(response.body.email.provider).toBe("not_configured");
});
