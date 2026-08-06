import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { sendOrderNotification } from "../lib/mailer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

    // Try to upload proof file to Supabase Storage
    let buktUrl: string | null = null;
    let buktFilename: string | null = null;

    if (req.file) {
      const ext = req.file.originalname.split(".").pop() ?? "bin";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      buktFilename = filename;

      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
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

    // Insert order into Supabase
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
      return res.status(500).json({ error: "Gagal menyimpan pesanan. Coba lagi." });
    }

    // Send email notification (best-effort)
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

    return res.status(201).json({ ok: true, order_id: order.id });
  }
);

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
