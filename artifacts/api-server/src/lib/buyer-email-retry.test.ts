import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockSendAndTrackBuyerEmail = vi.fn();
const mockOrderToEmailData = vi.fn((order: unknown) => order);

vi.mock("./supabase", () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock("./buyer-email", () => ({
  orderToEmailData: mockOrderToEmailData,
  sendAndTrackBuyerEmail: mockSendAndTrackBuyerEmail,
}));

const {
  BUYER_EMAIL_MAX_RETRIES,
  BUYER_EMAIL_RETRY_INTERVAL_MS,
  BUYER_EMAIL_RETRY_MAX_AGE_MS,
  retryFailedBuyerEmails,
} = await import("./buyer-email-retry");

function queryStub(result: { data?: unknown; error?: unknown }) {
  const stub: Record<string, unknown> = {};
  const chain = () => stub;
  for (const method of ["select", "update", "eq", "gte"]) {
    stub[method] = chain;
  }
  stub["maybeSingle"] = vi.fn().mockResolvedValue(result);
  Object.defineProperty(stub, "then", {
    value: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  });
  return stub;
}

const NOW = new Date("2026-08-30T12:00:00.000Z");

function failedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    nama_perusahaan: "PT Test",
    nama_pic: "Budi",
    email: "budi@test.com",
    whatsapp: "08123456789",
    produk: "Layanan A",
    catatan: null,
    bukti_url: null,
    buyer_email_sent: false,
    buyer_email_error: "Resend sementara tidak tersedia",
    buyer_email_delivery_state: "failed",
    buyer_email_retry_count: 0,
    buyer_email_last_attempt_at: null,
    created_at: new Date(
      NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS,
    ).toISOString(),
    ...overrides,
  };
}

describe("automatic buyer email retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAndTrackBuyerEmail.mockResolvedValue({ sent: true, tracked: true });
  });

  it("claims and retries an eligible failed order", async () => {
    const order = failedOrder();
    const claimedOrder = { ...order, buyer_email_retry_count: 1 };
    mockFrom
      .mockReturnValueOnce(queryStub({ data: [order], error: null }))
      .mockReturnValueOnce(queryStub({ data: claimedOrder, error: null }));

    const result = await retryFailedBuyerEmails(NOW);

    expect(result).toMatchObject({
      found: 1,
      claimed: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mockFrom).toHaveBeenNthCalledWith(1, "orders");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "orders");
    expect(mockSendAndTrackBuyerEmail).toHaveBeenCalledWith(
      order.id,
      claimedOrder,
      1,
      NOW,
    );
  });

  it("does not retry pending, expired, cooled-down, or exhausted orders", async () => {
    const orders = [
      failedOrder({
        id: "pending",
        buyer_email_error: null,
        buyer_email_delivery_state: "pending",
        created_at: NOW.toISOString(),
      }),
      failedOrder({
        id: "expired",
        created_at: new Date(
          NOW.getTime() - BUYER_EMAIL_RETRY_MAX_AGE_MS - 1,
        ).toISOString(),
      }),
      failedOrder({
        id: "cooldown",
        buyer_email_last_attempt_at: new Date(
          NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS + 1,
        ).toISOString(),
      }),
      failedOrder({
        id: "exhausted",
        buyer_email_retry_count: BUYER_EMAIL_MAX_RETRIES,
        buyer_email_last_attempt_at: new Date(
          NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS + 1,
        ).toISOString(),
      }),
    ];
    mockFrom.mockReturnValueOnce(queryStub({ data: orders, error: null }));

    const result = await retryFailedBuyerEmails(NOW);

    expect(result).toMatchObject({
      found: 4,
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 4,
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockSendAndTrackBuyerEmail).not.toHaveBeenCalled();
  });

  it("reconciles a stale final attempt without increasing the retry count", async () => {
    const exhausted = failedOrder({
      buyer_email_retry_count: BUYER_EMAIL_MAX_RETRIES,
      buyer_email_delivery_state: "sending",
      buyer_email_last_attempt_at: new Date(
        NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS,
      ).toISOString(),
    });
    const claimedOrder = {
      ...exhausted,
      buyer_email_last_attempt_at: NOW.toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(queryStub({ data: [exhausted], error: null }))
      .mockReturnValueOnce(queryStub({ data: claimedOrder, error: null }));

    const result = await retryFailedBuyerEmails(NOW);

    expect(result).toMatchObject({ claimed: 1, sent: 1, skipped: 0 });
    expect(mockSendAndTrackBuyerEmail).toHaveBeenCalledWith(
      exhausted.id,
      claimedOrder,
      BUYER_EMAIL_MAX_RETRIES,
      NOW,
    );
  });

  it("does not call the provider again after a confirmed final failure", async () => {
    const exhaustedFailure = failedOrder({
      buyer_email_retry_count: BUYER_EMAIL_MAX_RETRIES,
      buyer_email_delivery_state: "failed",
      buyer_email_last_attempt_at: new Date(
        NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS,
      ).toISOString(),
    });
    mockFrom.mockReturnValueOnce(
      queryStub({ data: [exhaustedFailure], error: null }),
    );

    const result = await retryFailedBuyerEmails(NOW);

    expect(result).toMatchObject({ claimed: 0, sent: 0, skipped: 1 });
    expect(mockSendAndTrackBuyerEmail).not.toHaveBeenCalled();
  });

  it("recovers an unresolved initial attempt after one full interval", async () => {
    const unresolved = failedOrder({
      buyer_email_error: null,
      buyer_email_delivery_state: "sending",
      buyer_email_last_attempt_at: new Date(
        NOW.getTime() - BUYER_EMAIL_RETRY_INTERVAL_MS,
      ).toISOString(),
    });
    const claimedOrder = {
      ...unresolved,
      buyer_email_retry_count: 1,
      buyer_email_last_attempt_at: NOW.toISOString(),
    };
    mockFrom
      .mockReturnValueOnce(queryStub({ data: [unresolved], error: null }))
      .mockReturnValueOnce(queryStub({ data: claimedOrder, error: null }));

    const result = await retryFailedBuyerEmails(NOW);

    expect(result).toMatchObject({ claimed: 1, sent: 1, skipped: 0 });
    expect(mockSendAndTrackBuyerEmail).toHaveBeenCalledOnce();
  });

  it("stops cleanly when the failed-order lookup errors", async () => {
    mockFrom.mockReturnValueOnce(
      queryStub({ data: null, error: { message: "DB unavailable" } }),
    );

    await expect(retryFailedBuyerEmails(NOW)).resolves.toEqual({
      found: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(mockSendAndTrackBuyerEmail).not.toHaveBeenCalled();
  });
});