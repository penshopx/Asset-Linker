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

const { sendStatusUpdate } = await import("./mailer");

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

  beforeEach(() => {
    mockSend.mockClear();
    mockSend.mockResolvedValue({
      data: { id: "email-1" },
      error: null,
    });
  });

  afterEach(() => {
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
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow(
      "SITE_URL is not set",
    );

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("SITE_URL is not set"),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects non-HTTP(S) SITE_URL values", async () => {
    process.env["SITE_URL"] = "javascript:alert(1)";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendStatusUpdate(statusEmail)).rejects.toThrow(
      "SITE_URL must use http:// or https://",
    );

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("SITE_URL must use http:// or https://"),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});