import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const artifactDir = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./__fixtures__/startup-network.mjs", import.meta.url));
const generatedDir = path.resolve(artifactDir, "../../generated-artifacts");
let buildDir: string;

// Never inherit workspace credentials, NODE_OPTIONS, proxies, or provider settings.
const syntheticEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  LOG_LEVEL: "info",
  SUPABASE_URL: "https://startup-db.example.test",
  SUPABASE_ANON_KEY: "synthetic-anon-key-startup-only",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key-startup-only",
  SESSION_SECRET: "synthetic-session-secret-startup-only",
  ADMIN_PASSCODE: "synthetic-admin-passcode-startup-only",
};
const fakeEmailKey = "re_synthetic_startup_only_not_a_real_key";

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

beforeAll(async () => {
  await mkdir(generatedDir, { recursive: true });
  buildDir = await mkdtemp(path.join(generatedDir, "email-startup-"));
  const build = spawn(process.execPath, ["build.mjs", "--outdir", buildDir], {
    cwd: artifactDir, env: syntheticEnv, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  build.stdout!.on("data", (chunk) => { output += chunk; });
  build.stderr!.on("data", (chunk) => { output += chunk; });
  try {
    const [code] = await once(build, "exit", { signal: AbortSignal.timeout(45_000) });
    expect(code, output).toBe(0);
  } finally {
    await stop(build);
  }
}, 50_000);

afterAll(async () => {
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
});

describe("built API email startup", () => {
  it.each([
    { name: "missing SITE_URL", siteUrl: undefined, enabled: true, links: "invalid", level: 50 },
    { name: "empty SITE_URL", siteUrl: "", enabled: true, links: "invalid", level: 50 },
    { name: "malformed SITE_URL", siteUrl: "not-a-url-private-marker", enabled: true, links: "invalid", level: 50 },
    {
      name: "URL containing credentials and query",
      siteUrl: "https://private-user:private-password@private-host.example.test/app?token=private-token#private-fragment",
      enabled: true, links: "invalid", level: 50,
    },
    { name: "valid SITE_URL", siteUrl: "https://valid-private-host.example.test/app/", enabled: true, links: "valid", level: 30 },
    { name: "disabled email without SITE_URL", siteUrl: undefined, enabled: false, links: "not_required", level: 40 },
    { name: "disabled email with malformed SITE_URL", siteUrl: "disabled-private-marker", enabled: false, links: "not_required", level: 40 },
  ])("$name", async ({ siteUrl, enabled, links, level }) => {
    const port = await unusedPort();
    const env = {
      ...syntheticEnv,
      PORT: String(port),
      RESEND_API_KEY: enabled ? fakeEmailKey : "",
      ...(siteUrl === undefined ? {} : { SITE_URL: siteUrl }),
    };
    const child = spawn(process.execPath, [
      "--import", preload, "--enable-source-maps", path.join(buildDir, "index.mjs"),
    ], { cwd: artifactDir, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let stderr = "";
    child.stdout!.on("data", (chunk) => { output += chunk; });
    child.stderr!.on("data", (chunk) => { stderr += chunk; });
    const records = () => output.trim().split("\n").filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    try {
      await expect.poll(() => {
        if (child.exitCode !== null) throw new Error(`API exited: ${child.exitCode}\n${stderr}`);
        return records().some((record) => record.msg === "[migrate] Migrations applied successfully");
      }, { timeout: 10_000 }).toBe(true);

      const logs = records();
      const validation = logs.filter((record) => "requiredUrlFormat" in record);
      expect(validation).toHaveLength(1);
      expect(validation[0]).toMatchObject({
        level, environment: "production",
        email: { enabled, links, provider: enabled ? "unchecked" : "not_configured" },
        requiredUrlFormat: expect.stringContaining("absolute http:// or https://"),
        msg: expect.stringMatching(links === "invalid"
          ? /Email link configuration invalid: SITE_URL/
          : enabled ? /Email link configuration valid/ : /Email delivery disabled/),
      });
      const listeningIndex = logs.findIndex((record) => record.msg === "Server listening");
      expect(listeningIndex).toBeGreaterThan(logs.indexOf(validation[0]!));

      const base = `http://127.0.0.1:${port}/api`;
      const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2_000) });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok" });
      const ready = await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(2_000) });
      expect(ready.status).toBe(links === "invalid" ? 503 : 200);
      expect(ready.headers.get("cache-control")).toBe("no-store");
      const body = await ready.json();
      expect(body).toEqual({
        status: links === "invalid" ? "not_ready" : "ready",
        email: { enabled, links, provider: enabled ? "unchecked" : "not_configured" },
        database: { migrations: "succeeded" },
      });
      // Invalid email configuration must not kill the listener after readiness fails.
      expect((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2_000) })).status).toBe(200);
      expect(child.exitCode).toBeNull();
      expect(stderr).toBe("");
      const visible = output + stderr + JSON.stringify(body);
      for (const secret of [
        fakeEmailKey, syntheticEnv.SUPABASE_ANON_KEY!, syntheticEnv.SUPABASE_SERVICE_ROLE_KEY!,
        syntheticEnv.SESSION_SECRET!, syntheticEnv.ADMIN_PASSCODE!,
        ...(siteUrl ? [siteUrl] : []),
        "private-user", "private-password", "private-host", "private-token", "private-fragment",
      ]) {
        expect(visible).not.toContain(secret);
      }
    } finally {
      await stop(child);
    }
  }, 15_000);
});
