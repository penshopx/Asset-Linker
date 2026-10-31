import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

/** No shared-passcode fallback. Resolve the account and role on every request,
 * rather than trusting a client name or a potentially stale role claim. */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sesi berakhir. Masuk kembali dengan akun admin pribadi." });
    return;
  }
  // Clerk validates the session; reject cross-origin cookie-authenticated writes too.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const site = process.env.SITE_URL;
    if (req.get("sec-fetch-site") === "cross-site" ||
        (origin && (!site || origin !== new URL(site).origin))) {
      res.status(403).json({ error: "Asal permintaan tidak diizinkan." });
      return;
    }
  }
  try {
    const client = clerkClient;
    let user = await client.users.getUser(userId);
    const email = user.emailAddresses.find(e =>
      e.id === user.primaryEmailAddressId && e.verification?.status === "verified");
    if (!email) {
      res.status(403).json({ error: "Verifikasi email utama akun sebelum mengakses panel admin." });
      return;
    }
    // Owner-controlled email is the bootstrap anchor, never the first signup.
    // Persist the marker so removing an admin role does not silently restore it.
    const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (owner && email.emailAddress.toLowerCase() === owner &&
        user.publicMetadata.role === undefined &&
        user.privateMetadata.adminBootstrapCompleted !== true) {
      user = await client.users.updateUserMetadata(userId, {
        publicMetadata: { role: "admin" },
        privateMetadata: { adminBootstrapCompleted: true },
      });
    }
    if (user.publicMetadata.role !== "admin") {
      res.status(403).json({ error: "Akun ini tidak memiliki izin admin. Hubungi pengelola untuk pemberian akses." });
      return;
    }
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      email.emailAddress;
    res.locals.admin = { id: user.id, name, email: email.emailAddress } satisfies AdminIdentity;
    next();
  } catch {
    req.log.error("Admin account verification failed");
    res.status(503).json({ error: "Tidak dapat memverifikasi akun admin. Coba lagi." });
  }
};
