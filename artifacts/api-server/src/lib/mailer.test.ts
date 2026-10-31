import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: mockSend,
    };
  },
}));

process.env["RESEND_API_KEY"] = "test-resend-key";

let sendStatusUpdate: typeof import("./mailer").sendStatusUpdate;
let logger: typeof import("./logger").logger;
let getEmailReadiness: typeof import("./email-readiness").getEmailReadiness;

const statusEmail = {
  orderId: "order/123",
  namaPerusahaan: "PT Test",
  namaPic: "Budi",
  email: "budi@example.com",
  produk: "Layanan A",
  newStatus: "diproses",
};

describe("sendStatusUpdate", () => {
  const originalSiteUrl = process.env["SITE_URL"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sendStatusUpdate } = await import("./mailer"));
    ({ logger } = await import("./logger"));
    ({ getEmailReadiness } = await import("./email-readiness"));
    process.env["SITE_URL"] = "https://preview.example.test";
    mockSend.mockClear();
    mockSend.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalSiteUrl === undefined) {
      delete process.env["SITE_URL"];
    } else {
      process.env["SITE_URL"] = originalSiteUrl;
    }
  });

  it("uses the configured environment URL and encodes the order ID", async () => {
    process.env["SITE_URL"] = "https://preview.example.test/";

    await sendStatusUpdate(statusEmail);

    expect(mockSend.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        html: expect.stringContaining(
          'href="https://preview.example.test/cek-pesanan?id=order%2F123"',
        ),
      }),
    );
  });

  it("fails clearly without sending when SITE_URL is missing", async () => {
    delete process.env["SITE_URL"];
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow(
      "SITE_URL is not set",
    );

    expect(warning).toHaveBeenCalledWith(
      expect.any(Object), expect.stringContaining("invalid SITE_URL"),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects non-HTTP(S) SITE_URL values", async () => {
    process.env["SITE_URL"] = "javascript:alert(1)";
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow(
      "SITE_URL must use http:// or https://",
    );

    expect(warning).toHaveBeenCalledWith(
      expect.any(Object), expect.stringContaining("invalid SITE_URL"),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each(["rejected", "network", "missing_id"])(
    "reports %s send failures separately from link configuration and recovers on success",
    async (failure) => {
      process.env["SITE_URL"] = "https://preview.example.test";
      if (failure === "network") mockSend.mockRejectedValueOnce(new Error("offline"));
      else mockSend.mockResolvedValueOnce(
        failure === "rejected"
          ? { data: null, error: { message: "unavailable" } }
          : { data: {}, error: null },
      );
      await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
      expect(getEmailReadiness()).toMatchObject({
        status: "not_ready", email: { links: "valid", provider: "unavailable" },
      });
      await sendStatusUpdate(statusEmail);
      expect(getEmailReadiness()).toMatchObject({
        status: "ready", email: { links: "valid", provider: "available" },
      });
    },
  );
  it.each([
    "validation_error", "invalid_parameter", "missing_required_field",
    "invalid_attachment", "invalid_idempotency_key", "invalid_idempotent_request",
    "concurrent_idempotent_requests",
  ])("does not treat structured %s as a provider outage", async (name) => {
    const reject = () => mockSend.mockResolvedValueOnce({
      data: null, error: { name, statusCode: 422, message: "Message rejected" },
    });
    reject();
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow("Message rejected");
    expect(getEmailReadiness()).toMatchObject({
      status: "ready", email: { provider: "unchecked" },
    });
    await sendStatusUpdate(statusEmail);
    reject();
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    expect(getEmailReadiness().email.provider).toBe("available");

    mockSend.mockRejectedValueOnce(new Error("offline"));
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    reject();
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    expect(getEmailReadiness().email.provider).toBe("unavailable");
  });

  it.each([
    ["invalid_api_key", 401], ["missing_api_key", 401],
    ["restricted_api_key", 403], ["invalid_access", 403],
    ["security_error", 403], ["invalid_from_address", 422],
    ["invalid_region", 422], ["monthly_quota_exceeded", 429],
    ["daily_quota_exceeded", 429], ["validation_error", 403],
  ])("keeps %s unavailable beyond cooldown until a real send succeeds", async (name, statusCode) => {
    vi.useFakeTimers();
    mockSend.mockResolvedValueOnce({
      data: null, error: { name, statusCode, message: "Configuration rejected" },
    });
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    expect(getEmailReadiness().email.provider).toBe("unavailable");
    // A subsequent temporary failure cannot downgrade the known configuration problem.
    mockSend.mockRejectedValueOnce(new Error("offline"));
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(getEmailReadiness()).toMatchObject({ status: "not_ready" });
    expect(mockSend).toHaveBeenCalledTimes(2);
    await sendStatusUpdate(statusEmail);
    expect(getEmailReadiness()).toMatchObject({
      status: "ready", email: { provider: "available" },
    });
  });

  it.each([
    ["rate_limit_exceeded", 429], ["internal_server_error", 500],
    ["application_error", null], ["new_provider_error", 503],
    ["new_provider_error", 400], ["validation_error", 500],
    ["validation_error", 429],
  ])("expires temporary %s (%s) to unchecked without sending a probe", async (name, statusCode) => {
    vi.useFakeTimers();
    mockSend.mockResolvedValueOnce({
      data: null, error: { name, statusCode, message: "Temporary failure" },
    });
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(getEmailReadiness()).toMatchObject({
      status: "not_ready", email: { provider: "unavailable" },
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(getEmailReadiness()).toMatchObject({
      status: "ready", email: { provider: "unchecked" },
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    await sendStatusUpdate(statusEmail);
    expect(getEmailReadiness().email.provider).toBe("available");
  });

  it("refreshes the cooldown on a new network failure, without scheduling email", async () => {
    vi.useFakeTimers();
    mockSend.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(30_000);
    mockSend.mockRejectedValueOnce(new Error("socket closed"));
    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow("socket closed");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(getEmailReadiness().email.provider).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(1);
    expect(getEmailReadiness().email.provider).toBe("unchecked");
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});