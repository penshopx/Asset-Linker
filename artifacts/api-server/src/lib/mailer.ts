import { Resend } from "resend";

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

export async function sendOrderNotification(data: OrderEmailData): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];

  if (!resend || !adminEmail) {
    console.warn(
      "[mailer] Skipping email — RESEND_API_KEY or ADMIN_EMAIL not set"
    );
    return;
  }

  const waLink = `https://wa.me/${data.whatsapp.replace(/\D/g, "")}`;

  await resend.emails.send({
    from: "DokumenProyek <noreply@dokumenproyek.com>",
    to: adminEmail,
    subject: `📦 Pesanan Baru: ${data.produk} — ${data.namaPerusahaan}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">
          Pesanan Baru Masuk
        </h2>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding:8px; color:#64748b; width:160px;">ID Pesanan</td><td style="padding:8px; font-weight:600;">#${data.orderId.slice(0, 8).toUpperCase()}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Nama Perusahaan</td><td style="padding:8px;">${data.namaPerusahaan}</td></tr>
          <tr><td style="padding:8px; color:#64748b;">Nama PIC</td><td style="padding:8px;">${data.namaPic}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Email</td><td style="padding:8px;">${data.email}</td></tr>
          <tr><td style="padding:8px; color:#64748b;">WhatsApp</td><td style="padding:8px;"><a href="${waLink}">${data.whatsapp}</a></td></tr>
          <tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Produk</td><td style="padding:8px; font-weight:600;">${data.produk}</td></tr>
          ${data.catatan ? `<tr><td style="padding:8px; color:#64748b;">Catatan</td><td style="padding:8px;">${data.catatan}</td></tr>` : ""}
          ${data.buktUrl ? `<tr style="background:#f8fafc;"><td style="padding:8px; color:#64748b;">Bukti Bayar</td><td style="padding:8px;"><a href="${data.buktUrl}">Lihat File</a></td></tr>` : ""}
        </table>
        <div style="margin-top: 24px;">
          <a href="${waLink}" style="background:#22c55e; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">
            Chat WhatsApp PIC
          </a>
          <a href="${process.env["ADMIN_EMAIL"] ? "" : "#"}" style="background:#0f172a; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block; margin-left:12px;">
            Buka Dashboard Admin
          </a>
        </div>
      </div>
    `,
  });
}
