import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function actorKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required for admin audit encryption");
  // Domain separation: do not reuse a session-signing key directly as an AES key.
  return createHash("sha256").update("order-admin-audit-v1\0").update(secret).digest();
}

/** Never persist a plaintext actor: Supabase is accessed using an anon key. */
export function encryptAdminActor(name: string, orderId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", actorKey(), iv);
  cipher.setAAD(Buffer.from(orderId));
  const encrypted = Buffer.concat([cipher.update(name, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/** Call only after requireAdmin. Unknown/corrupt data fails explicitly. */
export function decryptAdminActor(value: unknown, orderId: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.startsWith(PREFIX)) {
    throw new Error("Invalid encrypted admin identity");
  }
  const payload = Buffer.from(value.slice(PREFIX.length), "base64");
  if (payload.length <= 28) throw new Error("Invalid encrypted admin identity");
  const decipher = createDecipheriv("aes-256-gcm", actorKey(), payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(orderId));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

/** The order's internal audit envelope is not part of any API response. */
export function withoutActorEnvelope<T extends { status_changed_by?: unknown }>(order: T) {
  const { status_changed_by: _internal, ...safeOrder } = order;
  return safeOrder;
}
