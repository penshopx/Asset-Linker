import { afterEach, expect, it, vi } from "vitest";

const { createClient, fakeClient } = vi.hoisted(() => ({
  createClient: vi.fn(), fakeClient: {},
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.resetModules();
});

it("fails explicitly rather than using the anon key when the server credential is absent", async () => {
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { getProofCleanupClient } = await import("./proof-cleanup-client");
  expect(() => getProofCleanupClient()).toThrow(/server-only SUPABASE_SERVICE_ROLE_KEY/);
  expect(createClient).not.toHaveBeenCalled();
});

it("uses the server-only credential and disables browser-session behavior", async () => {
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-key-for-tests");
  createClient.mockReturnValue(fakeClient);
  const { getProofCleanupClient } = await import("./proof-cleanup-client");
  expect(getProofCleanupClient()).toBe(fakeClient);
  expect(getProofCleanupClient()).toBe(fakeClient);
  expect(createClient).toHaveBeenCalledTimes(1);
  expect(createClient).toHaveBeenCalledWith("https://test.invalid", "fake-service-key-for-tests", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});
