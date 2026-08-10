import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { sendOrderNotification, sendBuyerConfirmation } from "../lib/mailer";

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
    // 1. Check for a previously completed or in-flight request with the same key.
    // 2. If in-flight: await the existing promise so we share the result instead
    //    of creating a second order.
    // 3. If done within TTL: return cached result immediately.
    // 4. Otherwise: lock the key with a pending promise BEFORE any side effect,
    //    then fulfil/reject it after the DB write completes.
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
          // Another request with the same key is still processing — wait for it.
          console.log(`[orders] Idempotency hit (inflight) for key ${idempotencyKey}, awaiting result`);
          try {
            const orderId = await existing.promise;
            return res.status(200).json({ ok: true, order_id: orderId });
          } catch {
            // The first request failed; allow this retry to proceed as a fresh attempt.
            idempotencyCache.delete(idempotencyKey);
          }
        }
        // Expired done entry — fall through to process fresh.
      }
    }

    // ── Lock the key before any side effect ──────────────────────────────────
    // Any concurrent request with the same key will hit the "inflight" branch above
    // and wait on this promise rather than starting a second order creation.
    let resolveKey!: (orderId: string) => void;
    let rejectKey!: (err: unknown) => void;
    const inflightPromise = new Promise<string>((resolve, reject) => {
      resolveKey = resolve;
      rejectKey = reject;
    });
    // Attach a no-op catch so Node never sees this as an unhandled rejection,
    // even if no concurrent request is awaiting it when it is rejected.
    // Actual waiters that await the promise receive the rejection normally.
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
      })
      .select()
      .single();

    if (dbError) {
      console.error("[orders] DB insert error:", dbError);
      // Reject the in-flight promise so waiting retries can attempt again.
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

    // Send email notification to admin (best-effort)
    sendOrderNotification({
      orderId: order.id,
      namaPerusahaan: nama_perusahaan,
      namaPic: nama_pic,
      email,
      whatsapp,
      produk,
      catatan,
      buktUrl: buktUrl ?? undefined,
    }).catch((e) => console.error("[orders] Email notification error:", e));

    // Send confirmation email to buyer (best-effort)
    sendBuyerConfirmation({
      orderId: order.id,
      namaPerusahaan: nama_perusahaan,
      namaPic: nama_pic,
      email,
      whatsapp,
      produk,
      catatan,
      buktUrl: buktUrl ?? undefined,
    }).catch((e) => console.error("[orders] Buyer confirmation email error:", e));

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
  return res.json(data);
});

export default router;
