import {
  sendBuyerConfirmation,
  sendBuyerEmailFailureNotification,
  type OrderEmailData,
} from "./mailer";
import { supabase } from "./supabase";

export type BuyerEmailSendResult =
  | { sent: true; tracked: boolean }
  | { sent: false; tracked: boolean; error: string };

/**
 * Send a buyer confirmation and persist the result.
 *
 * This is shared by the initial order flow, the admin retry endpoint, and the
 * automatic retry worker so every attempt has the same database behaviour.
 */
export async function sendAndTrackBuyerEmail(
  orderId: string,
  emailData: OrderEmailData,
  retryCount = 0,
  attemptedAt = new Date(),
): Promise<BuyerEmailSendResult> {
  if (retryCount === 0) {
    const { error: attemptError } = await supabase
      .from("orders")
      .update({
        buyer_email_delivery_state: "sending",
        buyer_email_last_attempt_at: attemptedAt.toISOString(),
      })
      .eq("id", orderId)
      .eq("buyer_email_sent", false)
      .eq("buyer_email_retry_count", 0);

    if (attemptError) {
      const error = `Gagal mencatat percobaan email: ${attemptError.message}`;
      console.error("[buyer-email]", error);
      return { sent: false, tracked: false, error };
    }
  }

  try {
    await sendBuyerConfirmation(emailData);
    const { data, error } = await supabase
      .from("orders")
      .update({
        buyer_email_sent: true,
        buyer_email_error: null,
        buyer_email_delivery_state: "sent",
        buyer_email_last_attempt_at: attemptedAt.toISOString(),
      })
      .eq("id", orderId)
      .eq("buyer_email_retry_count", retryCount)
      .eq("buyer_email_last_attempt_at", attemptedAt.toISOString())
      .select("id")
      .maybeSingle();
    const tracked = !error && Boolean(data);
    if (!tracked) {
      console.error(
        "[buyer-email] Failed to record buyer_email_sent=true:",
        error?.message ?? "attempt ownership changed",
      );
    }
    return { sent: true, tracked };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[buyer-email] Buyer confirmation email failed:", errMsg);

    const { data, error } = await supabase
      .from("orders")
      .update({
        buyer_email_sent: false,
        buyer_email_error: errMsg,
        buyer_email_delivery_state: "failed",
        buyer_email_last_attempt_at: attemptedAt.toISOString(),
      })
      .eq("id", orderId)
      .eq("buyer_email_retry_count", retryCount)
      .eq("buyer_email_last_attempt_at", attemptedAt.toISOString())
      .select("id")
      .maybeSingle();
    const tracked = !error && Boolean(data);
    if (!tracked) {
      console.error(
        "[buyer-email] Failed to record buyer_email_error:",
        error?.message ?? "attempt ownership changed",
      );
    }

    void sendBuyerEmailFailureNotification({ ...emailData, error: errMsg }).catch(
      (notificationError: unknown) =>
        console.error(
          "[buyer-email] Admin buyer email failure notification error:",
          notificationError,
        ),
    );

    return { sent: false, tracked, error: errMsg };
  }
}

export function orderToEmailData(order: {
  id: string;
  nama_perusahaan: string;
  nama_pic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan?: string | null;
  bukti_url?: string | null;
}): OrderEmailData {
  return {
    orderId: order.id,
    namaPerusahaan: order.nama_perusahaan,
    namaPic: order.nama_pic,
    email: order.email,
    whatsapp: order.whatsapp,
    produk: order.produk,
    catatan: order.catatan ?? undefined,
    buktUrl: order.bukti_url ?? undefined,
  };
}