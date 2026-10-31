import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptAdminActor, decryptAdminIdentity, encryptAdminActor, encryptVerifiedAdminActor, withoutActorEnvelope } from "./admin-actor";

beforeEach(() => vi.stubEnv("SESSION_SECRET", "test-audit-secret-only"));
afterEach(() => vi.unstubAllEnvs());

describe("admin-only actor decryption", () => {
  it("distinguishes verified account snapshots from old self-declared names and nulls", () => {
    const envelope = encryptVerifiedAdminActor({ id: 'user_rina', name: 'Rina 李', email: 'rina@example.test' }, 'order-1');
    expect(envelope).not.toContain('user_rina');
    expect(decryptAdminIdentity(envelope, 'order-1')).toEqual({
      changed_by: 'Rina 李', changed_by_id: 'user_rina', changed_by_verified: true,
    });
    expect(decryptAdminIdentity(encryptAdminActor('Old Rina', 'order-1'), 'order-1')).toEqual({
      changed_by: 'Old Rina', changed_by_id: null, changed_by_verified: false,
    });
    expect(decryptAdminIdentity(null, 'order-1')).toEqual({
      changed_by: null, changed_by_id: null, changed_by_verified: false,
    });
    const oldJsonName = '{"version":2,"id":"fake","name":"Pretend Admin"}';
    expect(decryptAdminIdentity(encryptAdminActor(oldJsonName, 'order-1'), 'order-1')).toEqual({
      changed_by: oldJsonName, changed_by_id: null, changed_by_verified: false,
    });
  });
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
