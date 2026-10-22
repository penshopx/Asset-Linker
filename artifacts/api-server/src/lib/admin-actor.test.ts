import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptAdminActor, encryptAdminActor, withoutActorEnvelope } from "./admin-actor";

beforeEach(() => vi.stubEnv("SESSION_SECRET", "test-audit-secret-only"));
afterEach(() => vi.unstubAllEnvs());

describe("admin-only actor decryption", () => {
  it("stores an opaque authenticated envelope and preserves Unicode names", () => {
    const envelope = encryptAdminActor("Rina 李", "order-1");
    expect(envelope).toMatch(/^enc:v1:[A-Za-z0-9+/=]+$/);
    expect(envelope).not.toContain("Rina");
    expect(decryptAdminActor(envelope, "order-1")).toBe("Rina 李");
    expect(encryptAdminActor("Rina 李", "order-1")).not.toBe(envelope);
  });

  it("does not decrypt with a different secret or order", () => {
    const envelope = encryptAdminActor("Admin Rina", "order-1");
    expect(() => decryptAdminActor(envelope, "order-2")).toThrow();
    vi.stubEnv("SESSION_SECRET", "wrong-key");
    expect(() => decryptAdminActor(envelope, "order-1")).toThrow();
  });

  it("rejects tampering, plaintext, and absent server configuration", () => {
    const envelope = encryptAdminActor("Admin Rina", "order-1");
    const payload = Buffer.from(envelope.slice("enc:v1:".length), "base64");
    payload[28] ^= 1;
    expect(() => decryptAdminActor("enc:v1:" + payload.toString("base64"), "order-1")).toThrow();
    expect(() => decryptAdminActor("Admin Rina", "order-1")).toThrow();
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => encryptAdminActor("Admin Rina", "order-1")).toThrow();
    expect(() => decryptAdminActor(envelope, "order-1")).toThrow();
  });

  it("keeps legacy nulls readable and strips internal actor envelopes", () => {
    expect(decryptAdminActor(null, "order-1")).toBeNull();
    expect(decryptAdminActor(undefined, "order-1")).toBeNull();
    expect(withoutActorEnvelope({ id: "order-1", status_changed_by: "internal" })).toEqual({ id: "order-1" });
  });
});
