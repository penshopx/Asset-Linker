import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { sendOrderNotification, sendBuyerConfirmation, sendStatusUpdate, type OrderEmailData } from "../lib/mailer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Idempotency cache ────────────────────────────────────────────────────────
// Each entry is EITHER:
//   { kind: "done" }    – request completed; holds the order_id and TTL
//   { kind: "inflight"} – request is in progress; holds a Promise that resolves
//                         to the order_id when the first request finishes
//
// The key is stored atomically BEFORE any side effect (storage upload, DB insert)
// so that concurrent requests bearing the same key wait on the in-flight promise
// instead of racing past the check and each creating their own order.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes

type IdempotencyEntry =
  | { kind: "done"; orderId: string; expiresAt: number }
  | { kind: "inflight"; promise: Promise<string> };

const idempotencyCache = new Map<string, IdempotencyEntry>();

function cleanupExpiredKeys() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (entry.kind === "done" && entry.expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }
}

// ─── Auth middleware for admin routes ────────────────────────────────────────
function requireAdmin(req: any, res: any, next: any) {
  const passcode = req.headers["x-admin-passcode"] as string | undefined;
  if (!passcode || passcode !== process.env["ADMIN_PASSCODE"]) {
    return res.status(401).json({ error: "Passcode salah atau tidak ada." });
  }
  next();
}

// ─── Helper: send buyer confirmation and persist the result ──────────────────
async function sendAndTrackBuyerEmail(
  orderId: string,
  emailData: OrderEmailData
): Promise<void> {
  try {
    await sendBuyerConfirmation(emailData);
    // Mark as sent
    const { error } = await supabase
      .from("orders")
      .update({ buyer_email_sent: true, buyer_email_error: null })
      .eq("id", orderId);
    if (error) {
      console.error("[orders] Failed to record buyer_email_sent=true:", error.message);
    }
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[orders] Buyer confirmation email failed:", errMsg);
    // Persist failure so admin can see it and retry
    const { error } = await supabase
      .from("orders")
      .update({ buyer_email_sent: false, buyer_email_error: errMsg })
      .eq("id", orderId);
    if (error) {
      console.error("[orders] Failed to record buyer_email_error:", error.message);
    }
  }
}

// ─── POST /api/konfirmasi-pesanan ─────────────────────────────────────────────
router.post(
  "/konfirmasi-pesanan",
  upload.single("bukti_pembayaran"),
  async (req, res) => {
    const { nama_perusahaan, nama_pic, email, whatsapp, produk, catatan } = req.body as Record<string, string>;

    if (!nama_perusahaan || !nama_pic || !email || !whatsapp || !produk) {
      return res.status(400).json({ error: "Field wajib tidak lengkap." });
    }

    // ── Idempotency gate ──────────────────────────────────────────────────────
    const idempotencyKey = (req.headers["x-idempotency-key"] as string | undefined)?.trim();

    if (idempotencyKey) {
      cleanupExpiredKeys();
      const existing = idempotencyCache.get(idempotencyKey);

      if (existing) {
        if (existing.kind === "done" && existing.expiresAt > Date.now()) {
          console.log(`[orders] Idempotency hit (done) for key ${idempotencyKey}, order ${existing.orderId}`);
          return res.status(200).json({ ok: true, order_id: existing.orderId });
        }

        if (existing.kind === "inflight") {
          console.log(`[orders] Idempotency hit (inflight) for key ${idempotencyKey}, awaiting result`);
          try {
            const orderId = await existing.promise;
            return res.status(200).json({ ok: true, order_id: orderId });
          } catch {
            idempotencyCache.delete(idempotencyKey);
          }
        }
        // Expired done entry — fall through to process fresh.
      }
    }

    // ── Lock the key before any side effect ──────────────────────────────────
    let resolveKey!: (orderId: string) => void;
    let rejectKey!: (err: unknown) => void;
    const inflightPromise = new Promise<string>((resolve, reject) => {
      resolveKey = resolve;
      rejectKey = reject;
    });
    inflightPromise.catch(() => {});

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { kind: "inflight", promise: inflightPromise });
    }

    // ── Side effects (storage + DB) ───────────────────────────────────────────
    let buktUrl: string | null = null;
    let buktFilename: string | null = null;

    if (req.file) {
      const ext = req.file.originalname.split(".").pop() ?? "bin";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      buktFilename = filename;

      try {
        const { error: uploadError } = await supabase.storage
          .from("proofs")
          .upload(filename, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.warn("[orders] Storage upload failed, storing filename only:", uploadError.message);
        } else {
          const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(filename);
          buktUrl = urlData?.publicUrl ?? null;
        }
      } catch (e) {
        console.warn("[orders] Storage exception, storing filename only:", e);
      }
    }

    const { data: order, error: dbError } = await supabase
      .from("orders")
      .insert({
        nama_perusahaan,
        nama_pic,
        email,
        whatsapp,
        produk,
        catatan: catatan ?? null,
        bukti_filename: buktFilename,
        bukti_url: buktUrl,
        status: "baru",
        // Initialise email tracking — will be updated after send attempt below
        buyer_email_sent: false,
        buyer_email_error: null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[orders] DB insert error:", dbError);
      if (idempotencyKey) {
        rejectKey(dbError);
        idempotencyCache.delete(idempotencyKey);
      }
      return res.status(500).json({ error: "Gagal menyimpan pesanan. Coba lagi." });
    }

    // ── Fulfil the promise and promote the entry to "done" ───────────────────
    resolveKey(order.id);
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, {
        kind: "done",
        orderId: order.id,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    const emailData: OrderEmailData = {
      orderId: order.id,
      namaPerusahaan: nama_perusahaan,
      namaPic: nama_pic,
      email,
      whatsapp,
      produk,
      catatan,
      buktUrl: buktUrl ?? undefined,
    };

    // Send notification to admin (best-effort, not tracked)
    sendOrderNotification(emailData).catch((e) =>
      console.error("[orders] Admin email notification error:", e)
    );

    // Send buyer confirmation and persist the send status in the DB
    sendAndTrackBuyerEmail(order.id, emailData).catch((e) =>
      console.error("[orders] sendAndTrackBuyerEmail unexpected error:", e)
    );

    return res.status(201).json({ ok: true, order_id: order.id });
  }
);

// ─── GET /api/pesanan/:id — public order status (non-sensitive fields only) ───
router.get("/pesanan/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("orders")
    .select("id, status, produk, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[orders] GET pesanan error:", error);
    return res.status(500).json({ error: "Gagal memuat data pesanan. Coba lagi nanti." });
  }

  if (!data) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  return res.json(data);
});

// ─── GET /api/admin/orders ────────────────────────────────────────────────────
// Returns all columns including buyer_email_sent and buyer_email_error.
router.get("/admin/orders", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: "Gagal memuat data pesanan." });
  }
  return res.json(data);
});

// ─── PATCH /api/admin/orders/:id/status ──────────────────────────────────────
router.patch("/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: string };

  const VALID = ["baru", "diproses", "selesai", "dibatalkan"];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: "Status tidak valid." });
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: "Gagal memperbarui status." });
  }

  // Send status-change notification to buyer (best-effort — never fails the response)
  sendStatusUpdate({
    orderId: data.id,
    namaPerusahaan: data.nama_perusahaan,
    namaPic: data.nama_pic,
    email: data.email,
    produk: data.produk,
    newStatus: status,
  }).catch((e) =>
    console.error("[orders] Status update email failed:", e?.message ?? e)
  );

  return res.json(data);
});

// ─── POST /api/admin/orders/:id/retry-buyer-email ────────────────────────────
// Allows an admin to manually resend the buyer confirmation for a failed order.
router.post("/admin/orders/:id/retry-buyer-email", requireAdmin, async (req, res) => {
  const { id } = req.params;

  // Fetch the order (need all fields to rebuild email payload)
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ error: "Gagal memuat pesanan." });
  }
  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  if (order.buyer_email_sent === true) {
    return res.status(409).json({ error: "Email konfirmasi sudah berhasil terkirim sebelumnya." });
  }

  const emailData: OrderEmailData = {
    orderId: order.id,
    namaPerusahaan: order.nama_perusahaan,
    namaPic: order.nama_pic,
    email: order.email,
    whatsapp: order.whatsapp,
    produk: order.produk,
    catatan: order.catatan ?? undefined,
    buktUrl: order.bukti_url ?? undefined,
  };

  try {
    await sendBuyerConfirmation(emailData);
    const { error: updateError } = await supabase
      .from("orders")
      .update({ buyer_email_sent: true, buyer_email_error: null })
      .eq("id", id);
    if (updateError) {
      console.error("[orders] retry: failed to update buyer_email_sent:", updateError.message);
    }
    return res.json({ ok: true, message: "Email konfirmasi berhasil dikirim ulang." });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    await supabase
      .from("orders")
      .update({ buyer_email_sent: false, buyer_email_error: errMsg })
      .eq("id", id);
    return res.status(502).json({ error: `Gagal mengirim email: ${errMsg}` });
  }
});

export default router;
