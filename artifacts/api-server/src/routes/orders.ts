import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { sendOrderNotification, sendBuyerConfirmation, sendStatusUpdate, type OrderEmailData } from "../lib/mailer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Idempotency ──────────────────────────────────────────────────────────────
// Source of truth: the `idempotency_keys` DB table (write-protected by RLS,
// accessible only via the SECURITY DEFINER function `create_order_idempotent`).
//
// The in-process map coalesces concurrent same-process requests while the first
// RPC call is still in flight — it is NOT a cache; it does NOT survive restarts.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // mirrors the 10-min TTL in the DB function

const inflightMap = new Map<string, Promise<string>>();

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
    const { nama_perusahaan, nama_pic, email, whatsapp, produk, catatan } =
      req.body as Record<string, string>;

    if (!nama_perusahaan || !nama_pic || !email || !whatsapp || !produk) {
      return res.status(400).json({ error: "Field wajib tidak lengkap." });
    }

    const idempotencyKey =
      (req.headers["x-idempotency-key"] as string | undefined)?.trim() || null;

    // ── In-process gate (same server process, concurrent requests) ────────────
    // This avoids firing multiple RPCs for the exact same key simultaneously.
    if (idempotencyKey) {
      const inflight = inflightMap.get(idempotencyKey);
      if (inflight) {
        console.log(`[orders] Idempotency hit (inflight) for key ${idempotencyKey}`);
        try {
          const orderId = await inflight;
          return res.status(200).json({ ok: true, order_id: orderId });
        } catch {
          inflightMap.delete(idempotencyKey);
          // First request failed — fall through to attempt a fresh RPC.
        }
      }
    }

    // ── Register in-flight promise so concurrent same-process requests wait ───
    let resolveInflight!: (id: string) => void;
    let rejectInflight!: (err: unknown) => void;
    const inflightPromise = new Promise<string>((res, rej) => {
      resolveInflight = res;
      rejectInflight = rej;
    });
    inflightPromise.catch(() => {}); // suppress UnhandledPromiseRejection

    if (idempotencyKey) {
      inflightMap.set(idempotencyKey, inflightPromise);
    }

    // ── File upload (best-effort, non-transactional) ──────────────────────────
    // Happens before the atomic RPC so the URL can be included in the order row.
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

    // ── Atomic order creation + idempotency key claim ─────────────────────────
    // The SECURITY DEFINER Postgres function `create_order_idempotent` does both
    // in a single transaction:
    //   • If the key already exists and is within TTL → returns the existing order
    //     (is_duplicate = true) without inserting anything.
    //   • If the key is expired → deletes it and creates a fresh order.
    //   • If the key is new → inserts the order row and claims the key atomically.
    //   • Concurrent race (unique_violation on key insert) rolls back the entire
    //     transaction (order insert included) — no orphan orders are created.
    //     The losing process gets a 23505 error; we retry once.  On the retry
    //     the winner's key is already in the table so we return a duplicate.
    const rpcParams = {
      p_idempotency_key: idempotencyKey,
      p_nama_perusahaan: nama_perusahaan,
      p_nama_pic: nama_pic,
      p_email: email,
      p_whatsapp: whatsapp,
      p_produk: produk,
      p_catatan: catatan ?? null,
      p_bukti_filename: buktFilename,
      p_bukti_url: buktUrl,
    };

    let { data: rpcRows, error: rpcError } = await supabase.rpc(
      "create_order_idempotent",
      rpcParams
    );

    // ── Handle concurrent race: retry once ───────────────────────────────────
    if (rpcError && (rpcError as any).code === "23505" && idempotencyKey) {
      console.log(`[orders] Race on key ${idempotencyKey}; retrying to find winner`);
      const retried = await supabase.rpc("create_order_idempotent", rpcParams);
      rpcRows = retried.data;
      rpcError = retried.error;
    }

    if (rpcError) {
      console.error("[orders] create_order_idempotent error:", rpcError);
      if (idempotencyKey) {
        rejectInflight(rpcError);
        inflightMap.delete(idempotencyKey);
      }
      return res.status(500).json({ error: "Gagal menyimpan pesanan. Coba lagi." });
    }

    // rpcRows is an array (RETURNS TABLE); take the first (and only) row.
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const orderId: string = row.order_id;
    const isDuplicate: boolean = row.is_duplicate;

    resolveInflight(orderId);
    if (idempotencyKey) {
      inflightMap.delete(idempotencyKey);
    }

    // ── Duplicate: order already existed — skip side effects ─────────────────
    if (isDuplicate) {
      console.log(`[orders] Idempotency hit (DB) for key ${idempotencyKey}, order ${orderId}`);
      return res.status(200).json({ ok: true, order_id: orderId });
    }

    // ── New order: send emails ────────────────────────────────────────────────
    const emailData: OrderEmailData = {
      orderId,
      namaPerusahaan: nama_perusahaan,
      namaPic: nama_pic,
      email,
      whatsapp,
      produk,
      catatan,
      buktUrl: buktUrl ?? undefined,
    };

    // History is recorded automatically by the orders_status_history DB trigger.

    sendOrderNotification(emailData).catch((e) =>
      console.error("[orders] Admin email notification error:", e)
    );

    sendAndTrackBuyerEmail(orderId, emailData).catch((e) =>
      console.error("[orders] sendAndTrackBuyerEmail unexpected error:", e)
    );

    return res.status(201).json({ ok: true, order_id: orderId });
  }
);

// ─── GET /api/pesanan/:id — public order status (non-sensitive fields only) ───
router.get("/pesanan/:id", async (req, res) => {
  const { id } = req.params;

  const [orderResult, historyResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, produk, created_at, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("status_history")
      .select("status, changed_at")
      .eq("order_id", id)
      .order("changed_at", { ascending: true }),
  ]);

  if (orderResult.error) {
    console.error("[orders] GET pesanan error:", orderResult.error);
    return res.status(500).json({ error: "Gagal memuat data pesanan. Coba lagi nanti." });
  }

  if (!orderResult.data) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  if (historyResult.error) {
    console.error("[orders] GET status history error:", historyResult.error);
    return res.status(500).json({ error: "Gagal memuat riwayat status. Coba lagi nanti." });
  }

  return res.json({
    ...orderResult.data,
    history: historyResult.data,
  });
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

  // History is recorded automatically by the orders_status_history DB trigger.

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
router.post("/admin/orders/:id/retry-buyer-email", requireAdmin, async (req, res) => {
  const { id } = req.params;

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
