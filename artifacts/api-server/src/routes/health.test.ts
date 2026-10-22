import { afterEach, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { rpc, abortSignal } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("../lib/proof-cleanup-client", () => ({
  getProofCleanupClient: () => ({ rpc }),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "");
  rpc.mockReturnValue({ abortSignal });
  abortSignal.mockResolvedValue({ error: null, status: 200 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const { default: router } = await import("./health");
  const migrations = await import("../lib/migrate");
  return { app: express().use("/api", router), ...migrations };
}

it("reports pending before startup without querying the database for health checks", async () => {
  const { app } = await setup();
  await request(app).get("/api/healthz").expect(200, { status: "ok" });
  const response = await request(app).get("/api/readyz").expect(503);
  expect(response.body).toEqual({
    status: "not_ready",
    database: { migrations: "pending" },
    email: { enabled: false, links: "not_required", provider: "not_configured" },
  });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(rpc).not.toHaveBeenCalled();
});

it("stays unready during an in-flight RPC and retry backoff, then becomes ready on success", async () => {
  const { app, applyMigrations } = await setup();
  let fail!: (value: unknown) => void;
  abortSignal.mockImplementationOnce(() => new Promise((resolve) => { fail = resolve; }));
  const migration = applyMigrations();
  let response = await request(app).get("/api/readyz").expect(503);
  expect(response.body.database.migrations).toBe("pending");
  fail({ error: { code: "ENOTFOUND", message: "DNS failed" }, status: 0 });
  await vi.advanceTimersByTimeAsync(1_999);
  response = await request(app).get("/api/readyz").expect(503);
  expect(response.body.database.migrations).toBe("pending");
  await request(app).get("/api/healthz").expect(200, { status: "ok" });
  expect(rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await migration;
  response = await request(app).get("/api/readyz").expect(200);
  expect(response.body).toMatchObject({
    status: "ready", database: { migrations: "succeeded" },
  });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("reports failed after the retry limit without exposing database errors or SQL", async () => {
  const { app, applyMigrations, MIGRATION_MAX_ATTEMPTS } = await setup();
  abortSignal.mockResolvedValue({
    error: {
      code: "ENOTFOUND",
      message: "sensitive-host.example.test",
      details: "SELECT private_data; token=private-token",
    },
    status: 0,
  });
  const migration = applyMigrations();
  await vi.runAllTimersAsync();
  await migration;
  const response = await request(app).get("/api/readyz").expect(503);
  expect(response.body).toEqual({
    status: "not_ready",
    database: { migrations: "failed" },
    email: { enabled: false, links: "not_required", provider: "not_configured" },
  });
  expect(rpc).toHaveBeenCalledTimes(MIGRATION_MAX_ATTEMPTS);
  await request(app).get("/api/healthz").expect(200, { status: "ok" });
  expect(rpc).toHaveBeenCalledTimes(MIGRATION_MAX_ATTEMPTS);
});

it.each(["PGRST202", "42501", "42601"])(
  "does not claim readiness after terminal migration error %s",
  async (code) => {
    const { app, applyMigrations } = await setup();
    abortSignal.mockResolvedValue({
      error: { code, message: "private SQL/configuration details" }, status: 500,
    });
    await applyMigrations();
    const response = await request(app).get("/api/readyz").expect(503);
    expect(response.body.database).toEqual({ migrations: "failed" });
    expect(response.body.status).toBe("not_ready");
    expect(rpc).toHaveBeenCalledTimes(1);
  },
);
