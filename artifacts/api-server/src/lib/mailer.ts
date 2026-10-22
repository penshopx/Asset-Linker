import { Resend } from "resend";
import { recordEmailSend, validateSiteUrl } from "./email-readiness";
import { logger } from "./logger";

let resend: Resend | null = null;

if (process.env["RESEND_API_KEY"]) {
  resend = new Resend(process.env["RESEND_API_KEY"]);
}

export interface OrderEmailData {
  orderId: string;
  namaPerusahaan: string;
  namaPic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan?: string;
  buktUrl?: string;
}

/** Escape characters that have special meaning in HTML text content. */
function esc(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Validate that a URL is http/https before inserting it into an href attribute. */
function safeUrl(url: string | undefined | null): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // fall through
  }
  return "#";
}

function getSiteUrl(): string {
  try {
    return validateSiteUrl();
  } catch (err) {
    logger.warn({ environment: process.env["NODE_ENV"] ?? "unspecified" },
      "[mailer] Cannot send status update email: invalid SITE_URL; use an absolute HTTP(S) app base URL");
    throw err;
  }
}

/** Send and throw if Resend returns an error result (not just a rejected promise). */
async function sendOrThrow(
  payload: Parameters<Resend["emails"]["send"]>[0],
  options?: Parameters<Resend["emails"]["send"]>[1],
): Promise<void> {
  try {
    const { data, error } = await resend!.emails.send(payload, options);
    if (error) {
      throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
    }
    if (!data?.id) {
      throw new Error("Resend returned no email ID and no error — unexpected response");
    }
    recordEmailSend(true);
  } catch (err) {
    recordEmailSend(false);
    throw err;
  }
}

export async function sendBuyerConfirmation(data: OrderEmailData): Promise<void> {
  if (!resend) {
    console.warn("[mailer] Skipping buyer confirmation — RESEND_API_KEY not set");
    return;
  }

  const shortId = `#${data.orderId.slice(0, 8).toUpperCase()}`;

  await sendOrThrow(
    {
      from: "DokumenProyek <noreply@dokumenproyek.com>",
      to: data.email,
      subject: `✅ Pesanan Anda Diterima — ${esc(data.produk)} (${shortId})`,
      html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="background: #f59e0b; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; color: #0f172a; font-size: 22px;">DokumenProyek</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="margin-top: 0; color: #0f172a;">Pesanan Anda Berhasil Diterima 🎉</h2>
          <p style="color: #475569;">Halo <strong>${esc(data.namaPic)}</strong>,</p>
          <p style="color: #475569;">Terima kasih telah memesan melalui <strong>DokumenProyek</strong>. Pesanan Anda telah kami terima dan sedang dalam proses penanganan.</p>

          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Detail Pesanan</h3>
            <table style="width:100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;">ID Pesanan</td>
                <td style="padding: 6px 0; font-weight: 600;">${esc(shortId)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Nama Perusahaan</td>
                <td style="padding: 6px 0;">${esc(data.namaPerusahaan)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Produk</td>
                <td style="padding: 6px 0; font-weight: 600;">${esc(data.produk)}</td>
              </tr>
              ${data.catatan ? `<tr><td style="padding: 6px 0; color: #64748b;">Catatan</td><td style="padding: 6px 0;">${esc(data.catatan)}</td></tr>` : ""}
            </table>
          </div>

          <div style="background: #fefce8; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="margin: 0; color: #78350f; font-weight: 600;">⏱ Estimasi Tindak Lanjut</p>
            <p style="margin: 8px 0 0; color: #92400e;">Tim kami akan menghubungi Anda dalam <strong>1×24 jam</strong> melalui WhatsApp atau email untuk konfirmasi lebih lanjut.</p>
          </div>

          <p style="color: #475569; margin-top: 24px;">Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi kami.</p>
          <p style="color: #475569; margin-bottom: 0;">Salam,<br/><strong>Tim DokumenProyek</strong></p>
        </div>
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 16px;">
          Email ini dikirim secara otomatis. Mohon tidak membalas email ini.
        </p>
      </div>
    `,
    },
    {
      // All attempts for one order share a key, so an ambiguous response or
      // concurrent retry cannot create duplicate buyer confirmations.
      idempotencyKey: `buyer-confirmation-${data.orderId}`,
    },
  );
}

export interface StatusUpdateEmailData {
  orderId: string;
  namaPerusahaan: string;
  namaPic: string;
  email: string;
  produk: string;
  newStatus: string;
}

const STATUS_LABELS: Record<string, string> = {
  baru: "Baru",
  diproses: "Sedang Diproses",
  selesai: "Selesai ✅",
  dibatalkan: "Dibatalkan ❌",
};

const STATUS_COLORS: Record<string, string> = {
  baru: "#3b82f6",
  diproses: "#f59e0b",
  selesai: "#22c55e",
  dibatalkan: "#ef4444",
};

export async function sendStatusUpdate(data: StatusUpdateEmailData): Promise<void> {
  if (!resend) {
    console.warn("[mailer] Skipping status update email — RESEND_API_KEY not set");
    return;
  }

  const siteUrl = getSiteUrl();
  const statusUrl = `${siteUrl}/cek-pesanan?id=${encodeURIComponent(data.orderId)}`;
  const shortId = `#${data.orderId.slice(0, 8).toUpperCase()}`;
  const statusLabel = STATUS_LABELS[data.newStatus] ?? data.newStatus;
  const statusColor = STATUS_COLORS[data.newStatus] ?? "#64748b";

  await sendOrThrow({
    from: "DokumenProyek <noreply@dokumenproyek.com>",
    to: data.email,
    subject: `🔔 Status Pesanan Diperbarui — ${esc(data.produk)} (${shortId})`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="background: #f59e0b; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; color: #0f172a; font-size: 22px;">DokumenProyek</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="margin-top: 0; color: #0f172a;">Status Pesanan Anda Diperbarui</h2>
          <p style="color: #475569;">Halo <strong>${esc(data.namaPic)}</strong>,</p>
          <p style="color: #475569;">Kami ingin memberitahu bahwa status pesanan Anda telah diperbarui.</p>

          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Detail Pesanan</h3>
            <table style="width:100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;">ID Pesanan</td>
                <td style="padding: 6px 0; font-weight: 600;">${esc(shortId)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Nama Perusahaan</td>
                <td style="padding: 6px 0;">${esc(data.namaPerusahaan)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Produk</td>
                <td style="padding: 6px 0; font-weight: 600;">${esc(data.produk)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Status Terbaru</td>
                <td style="padding: 6px 0;">
                  <span style="background: ${statusColor}; color: #ffffff; padding: 3px 10px; border-radius: 9999px; font-size: 13px; font-weight: 600;">
                    ${esc(statusLabel)}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${esc(safeUrl(statusUrl))}" style="background: #f59e0b; color: #0f172a; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block; font-size: 15px;">
              Cek Status Pesanan →
            </a>
          </div>

          <p style="color: #475569; margin-bottom: 0;">Salam,<br/><strong>Tim DokumenProyek</strong></p>
        </div>
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 16px;">
          Email ini dikirim secara otomatis. Mohon tidak membalas email ini.
        </p>
      </div>
    `,
  });
}

export async function sendOrderNotification(data: OrderEmailData): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];

  if (!resend || !adminEmail) {
    console.warn(
      "[mailer] Skipping email — RESEND_API_KEY or ADMIN_EMAIL not set"
    );
    return;
  }

  const waLink = `https://wa.me/${data.whatsapp.replace(/\D/g, "")}`;

  await sendOrThrow({
    from: "DokumenProyek <noreply@dokumenproyek.com>",
    to: adminEmail,
    subject: `📦 Pesanan Baru: ${esc(data.produk)} — ${esc(data.namaPerusahaan)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">
          Pesanan Baru Masuk
        </h2>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding:8px; color:#64748b; width:160px;">ID Pesanan</td><td style="padding:8px; font-weight:600;">#${esc(data.orderId.slice(0, 8).toUpperCase())}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Nama Perusahaan</td><td style="padding:8px;">${esc(data.namaPerusahaan)}</td></tr>
          <tr><td style="padding:8px; color:#64748b;">Nama PIC</td><td style="padding:8px;">${esc(data.namaPic)}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Email</td><td style="padding:8px;">${esc(data.email)}</td></tr>
          <tr><td style="padding:8px; color:#64748b;">WhatsApp</td><td style="padding:8px;"><a href="${esc(waLink)}">${esc(data.whatsapp)}</a></td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Produk</td><td style="padding:8px; font-weight:600;">${esc(data.produk)}</td></tr>
          ${data.catatan ? `<tr><td style="padding:8px; color:#64748b;">Catatan</td><td style="padding:8px;">${esc(data.catatan)}</td></tr>` : ""}
          ${data.buktUrl ? `<tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Bukti Bayar</td><td style="padding:8px;"><a href="${esc(safeUrl(data.buktUrl))}">Lihat File</a></td></tr>` : ""}
        </table>
        <div style="margin-top: 24px;">
          <a href="${esc(waLink)}" style="background:#22c55e; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
            Chat WhatsApp PIC
          </a>
        </div>
      </div>
    `,
  });
}

export interface BuyerEmailFailureNotificationData extends OrderEmailData {
  error: string;
}

/**
 * Notify the admin separately when the buyer confirmation cannot be delivered.
 * The order remains the source of truth for retrying, so this notification is
 * best-effort and must never make the order request fail.
 */
export async function sendBuyerEmailFailureNotification(
  data: BuyerEmailFailureNotificationData
): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];

  if (!resend || !adminEmail) {
    console.warn(
      "[mailer] Skipping buyer email failure notification — RESEND_API_KEY or ADMIN_EMAIL not set"
    );
    return;
  }

  const shortId = `#${data.orderId.slice(0, 8).toUpperCase()}`;
  const waLink = `https://wa.me/${data.whatsapp.replace(/\D/g, "")}`;

  await sendOrThrow({
    from: "DokumenProyek <noreply@dokumenproyek.com>",
    to: adminEmail,
    subject: `⚠️ Email konfirmasi gagal: ${esc(data.produk)} — ${esc(data.namaPerusahaan)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a;">
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; color: #991b1b; font-size: 22px;">Email Konfirmasi Gagal Terkirim</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #475569; margin-top: 0;">
            Email konfirmasi untuk pesanan berikut tidak berhasil dikirim. Silakan buka dashboard admin untuk mencoba mengirim ulang.
          </p>
          <table style="width:100%; border-collapse: collapse; margin-top: 20px;">
            <tr><td style="padding:8px; color:#64748b; width:160px;">ID Pesanan</td><td style="padding:8px; font-weight:600;">${esc(shortId)}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Nama Perusahaan</td><td style="padding:8px;">${esc(data.namaPerusahaan)}</td></tr>
            <tr><td style="padding:8px; color:#64748b;">Nama PIC</td><td style="padding:8px;">${esc(data.namaPic)}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Email Pembeli</td><td style="padding:8px;">${esc(data.email)}</td></tr>
            <tr><td style="padding:8px; color:#64748b;">Produk</td><td style="padding:8px; font-weight:600;">${esc(data.produk)}</td></tr>
            <tr style="background:#fef2f2;"><td style="padding:8px; color:#991b1b;">Alasan</td><td style="padding:8px; color:#991b1b;">${esc(data.error)}</td></tr>
          </table>
          <div style="margin-top: 24px;">
            <a href="${esc(safeUrl(waLink))}" style="background:#22c55e; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
              Hubungi PIC via WhatsApp
            </a>
          </div>
        </div>
      </div>
    `,
  });
}
