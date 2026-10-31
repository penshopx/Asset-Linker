import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, abortSignal, log } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./proof-cleanup-client", () => ({ getProofCleanupClient: () => ({ rpc }) }));
vi.mock("./logger", () => ({ logger: log }));

import {
  applyMigrations,
  getMigrationStatus,
  MIGRATION_MAX_ATTEMPTS,
  MIGRATION_TIMEOUT_MS,
} from "./migrate";

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  rpc.mockReturnValue({ abortSignal });
  abortSignal.mockResolvedValue({ error: null, status: 200 });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("startup migration recovery", () => {
  it("applies the idempotent SQL immediately when connected", async () => {
    await applyMigrations();
    expect(getMigrationStatus()).toBe("succeeded");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("run_migration", {
      sql: expect.stringContaining("ADD COLUMN IF NOT EXISTS"),
    });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(log.info).toHaveBeenCalledWith({ attempt: 1 }, expect.any(String));
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("recovers from returned DNS errors and thrown nested network errors with backoff", async () => {
    abortSignal
      .mockResolvedValueOnce({
        error: { code: "", message: "TypeError: fetch failed", details: "getaddrinfo EAI_AGAIN" },
        status: 0,
      })
      .mockRejectedValueOnce(new TypeError("fetch failed", {
        cause: { code: "ECONNRESET" },
      }));
    const migration = applyMigrations();
    expect(getMigrationStatus()).toBe("pending");
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(getMigrationStatus()).toBe("pending");
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(rpc).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await migration;
    expect(getMigrationStatus()).toBe("succeeded");
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(log.info).toHaveBeenCalledWith({ attempt: 3 }, expect.any(String));
  });

  it.each([
    [{ code: "ENOTFOUND", message: "DNS lookup failed" }, 0],
    [{ code: "EPIPE", message: "Broken pipe" }, 0],
    [{ code: "", message: "upstream unavailable" }, 503],
    [{ code: "PGRST001", message: "connection unavailable" }, 503],
    [{ code: "08006", message: "connection failure" }, 500],
    [{ code: "55P03", message: "canceling statement due to lock timeout" }, 500],
    [{ code: "40P01", message: "deadlock detected" }, 500],
    [{ name: "TimeoutError", message: "TimeoutError: request timed out" }, 0],
  ])("bounds retries for transient failure %j", async (error, status) => {
    abortSignal.mockResolvedValue({ error, status });
    const migration = applyMigrations();
    await vi.runAllTimersAsync();
    await migration;
    expect(getMigrationStatus()).toBe("failed");
    expect(rpc).toHaveBeenCalledTimes(MIGRATION_MAX_ATTEMPTS);
    expect(log.warn.mock.calls.map(([fields]) => fields.retryInMs))
      .toEqual([2_000, 4_000, 8_000, 16_000, 30_000]);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: MIGRATION_MAX_ATTEMPTS }),
      expect.stringContaining("retry limit reached"),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["42601", "42501", "42P01", "PGRST301"])(
    "does not retry permanent SQL/auth error %s",
    async (code) => {
      abortSignal.mockResolvedValue({
        error: { code, message: "run_migration: invalid SQL or permissions" },
        status: 500,
      });
      await applyMigrations();
      expect(getMigrationStatus()).toBe("failed");
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ code }),
        expect.stringContaining("Permanent SQL/configuration"),
      );
      expect(log.warn).not.toHaveBeenCalled();
    },
  );

  it("gives manual instructions only when the helper is missing", async () => {
    abortSignal.mockResolvedValue({
      error: { code: "PGRST202", message: "Could not find run_migration" },
      status: 404,
    });
    await applyMigrations();
    expect(getMigrationStatus()).toBe("failed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("ALTER TABLE orders") }),
      expect.stringContaining("helper missing"),
    );
  });

  it("aborts a stalled RPC and recovers on a fresh request", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ms);
      return controller.signal;
    });
    let signal: AbortSignal | undefined;
    abortSignal.mockImplementationOnce((value: AbortSignal) => {
      signal = value;
      return new Promise((_resolve, reject) => {
        value.addEventListener("abort", () => reject(value.reason), { once: true });
      });
    });
    const migration = applyMigrations();
    await vi.advanceTimersByTimeAsync(MIGRATION_TIMEOUT_MS - 1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    await migration;
    expect(timeout).toHaveBeenCalledWith(MIGRATION_TIMEOUT_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(abortSignal.mock.calls[1]![0]).not.toBe(signal);
  });

  it("recovers from migration lock contention without blocking the caller", async () => {
    abortSignal.mockResolvedValueOnce({
      error: { code: "55P03", message: "lock timeout" }, status: 500,
    });
    const migration = applyMigrations();
    await vi.advanceTimersByTimeAsync(0);
    expect(getMigrationStatus()).toBe("pending");
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await migration;
    expect(getMigrationStatus()).toBe("succeeded");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("marks unexpected runner failures as failed before propagating them", async () => {
    log.info.mockImplementationOnce(() => { throw new Error("unexpected failure"); });
    await expect(applyMigrations()).rejects.toThrow("unexpected failure");
    expect(getMigrationStatus()).toBe("failed");
  });
});
