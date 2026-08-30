import { logger } from "./logger";
import {
  orderToEmailData,
  sendAndTrackBuyerEmail,
} from "./buyer-email";
import { supabase } from "./supabase";

export const BUYER_EMAIL_RETRY_INTERVAL_MS = 5 * 60 * 1000;
export const BUYER_EMAIL_RETRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const BUYER_EMAIL_MAX_RETRIES = 3;

export type FailedBuyerEmailOrder = {
  id: string;
  nama_perusahaan: string;
  nama_pic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan: string | null;
  bukti_url: string | null;
  buyer_email_sent: boolean;
  buyer_email_error: string | null;
  buyer_email_delivery_state?: "pending" | "sending" | "failed" | "sent" | null;
  buyer_email_retry_count?: number | null;
  buyer_email_last_attempt_at?: string | null;
  created_at: string;
};

export type BuyerEmailRetryRunResult = {
  found: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type BuyerEmailRetryClaim =
  | {
      claimed: true;
      order: FailedBuyerEmailOrder;
      retryCount: number;
      attemptedAt: Date;
    }
  | { claimed: false; reason: "not-eligible" | "claim-failed" | "race" };

/**
 * Retry failed buyer confirmations that are recent enough and have not
 * exceeded the automatic retry limit.
 *
 * A retry is claimed by updating the row with the expected current count.
 * That conditional update prevents duplicate sends if more than one server
 * process runs the worker at the same time.
 */
export async function retryFailedBuyerEmails(
  now = new Date(),
): Promise<BuyerEmailRetryRunResult> {
  const result: BuyerEmailRetryRunResult = {
    found: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  const cutoff = new Date(now.getTime() - BUYER_EMAIL_RETRY_MAX_AGE_MS);

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_email_sent", false)
    .gte("created_at", cutoff.toISOString());

  if (error) {
    logger.error({ err: error }, "Automatic buyer email retry lookup failed");
    return result;
  }

  const orders = (data ?? []) as FailedBuyerEmailOrder[];
  result.found = orders.length;

  for (const order of orders) {
    const claim = await claimBuyerEmailRetry(order, now);
    if (!claim.claimed) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;
    const sendResult = await sendAndTrackBuyerEmail(
      order.id,
      orderToEmailData(claim.order),
      claim.retryCount,
      claim.attemptedAt,
    );
    if (sendResult.sent) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  if (result.claimed > 0) {
    logger.info(
      {
        found: result.found,
        claimed: result.claimed,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
      },
      "Automatic buyer email retry run completed",
    );
  }

  return result;
}

/**
 * Atomically reserve one retry attempt. Both automatic and manual retries use
 * this path, so only one caller can own a given retry count.
 */
export async function claimBuyerEmailRetry(
  order: FailedBuyerEmailOrder,
  now = new Date(),
): Promise<BuyerEmailRetryClaim> {
  if (!isRetryable(order, now)) {
    return { claimed: false, reason: "not-eligible" };
  }

  const retryCount = normalizeRetryCount(order.buyer_email_retry_count);
  const isReconciliation =
    retryCount >= BUYER_EMAIL_MAX_RETRIES &&
    normalizeDeliveryState(order) === "sending";
  const nextRetryCount = isReconciliation ? retryCount : retryCount + 1;
  let claimQuery = supabase
    .from("orders")
    .update({
      buyer_email_retry_count: nextRetryCount,
      buyer_email_delivery_state: "sending",
      buyer_email_last_attempt_at: now.toISOString(),
    })
    .eq("id", order.id)
    .eq("buyer_email_sent", false)
    .eq("buyer_email_retry_count", retryCount);

  if (isReconciliation) {
    // At the cap, reserve a reconciliation slot by comparing the previous
    // timestamp. The retry count never exceeds the configured maximum.
    claimQuery = order.buyer_email_last_attempt_at
      ? claimQuery.eq(
          "buyer_email_last_attempt_at",
          order.buyer_email_last_attempt_at,
        )
      : claimQuery.is("buyer_email_last_attempt_at", null);
  }

  const { data: claimedOrder, error } = await claimQuery
    .select("*")
    .maybeSingle();

  if (error) {
    logger.error(
      { err: error, orderId: order.id },
      "Buyer email retry claim failed",
    );
    return { claimed: false, reason: "claim-failed" };
  }

  if (!claimedOrder) {
    return { claimed: false, reason: "race" };
  }

  return {
    claimed: true,
    order: claimedOrder as FailedBuyerEmailOrder,
    retryCount: nextRetryCount,
    attemptedAt: now,
  };
}

export function startBuyerEmailRetryJob(): NodeJS.Timeout {
  const interval = setInterval(() => {
    void retryFailedBuyerEmails().catch((error: unknown) => {
      logger.error({ err: error }, "Automatic buyer email retry job failed");
    });
  }, BUYER_EMAIL_RETRY_INTERVAL_MS);

  // The timer should not keep a graceful server shutdown or test process open.
  interval.unref();
  return interval;
}

function isRetryable(order: FailedBuyerEmailOrder, now: Date): boolean {
  if (order.buyer_email_sent) {
    return false;
  }

  const createdAt = Date.parse(order.created_at);
  if (
    !Number.isFinite(createdAt) ||
    now.getTime() - createdAt > BUYER_EMAIL_RETRY_MAX_AGE_MS
  ) {
    return false;
  }

  const retryCount = normalizeRetryCount(order.buyer_email_retry_count);
  const deliveryState = normalizeDeliveryState(order);
  if (
    retryCount >= BUYER_EMAIL_MAX_RETRIES &&
    deliveryState !== "sending"
  ) {
    return false;
  }

  // A false flag without an error normally means the initial send is in
  // flight. If it stays unresolved for a full interval, recover it safely;
  // the provider idempotency key prevents duplicate delivery.
  if (!order.buyer_email_error && !order.buyer_email_last_attempt_at) {
    if (now.getTime() - createdAt < BUYER_EMAIL_RETRY_INTERVAL_MS) {
      return false;
    }
  }

  if (order.buyer_email_last_attempt_at) {
    const lastAttemptAt = Date.parse(order.buyer_email_last_attempt_at);
    if (
      !Number.isFinite(lastAttemptAt) ||
      now.getTime() - lastAttemptAt < BUYER_EMAIL_RETRY_INTERVAL_MS
    ) {
      return false;
    }
  }

  return true;
}

function normalizeRetryCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function normalizeDeliveryState(
  order: FailedBuyerEmailOrder,
): "pending" | "sending" | "failed" | "sent" {
  if (order.buyer_email_delivery_state) {
    return order.buyer_email_delivery_state;
  }
  if (order.buyer_email_sent) {
    return "sent";
  }
  return order.buyer_email_error ? "failed" : "pending";
}