import { afterEach, expect, it, vi } from "vitest";

const { listen, migrate, retry, log } = vi.hoisted(() => ({
  listen: vi.fn(),
  migrate: vi.fn(),
  retry: vi.fn(),
  log: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("./app", () => ({ default: { listen } }));
vi.mock("./lib/migrate", () => ({ applyMigrations: migrate }));
vi.mock("./lib/buyer-email-retry", () => ({ startBuyerEmailRetryJob: retry }));
vi.mock("./lib/logger", () => ({ logger: log }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.resetModules();
});

it("starts listening and the retry worker even while migrations are unresolved", async () => {
  vi.stubEnv("PORT", "5000");
  let finish!: () => void;
  migrate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await import("./index");
  expect(listen).toHaveBeenCalledWith(5000, expect.any(Function));
  expect(migrate).not.toHaveBeenCalled();
  listen.mock.calls[0]![1]();
  expect(migrate).toHaveBeenCalledTimes(1);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(log.info).toHaveBeenCalledWith({ port: 5000 }, "Server listening");
  finish();
});

it("handles an unexpected runner rejection without stopping the server", async () => {
  vi.stubEnv("PORT", "5000");
  const error = new Error("unexpected runner failure");
  migrate.mockRejectedValue(error);
  listen.mockImplementation((_port, callback) => callback());
  await import("./index");
  expect(log.error).toHaveBeenCalledWith(
    { err: error }, expect.stringContaining("non-fatal"),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
