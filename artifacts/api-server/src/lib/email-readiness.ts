import { logger } from "./logger";

export const SITE_URL_FORMAT =
  "Set SITE_URL for this environment to an absolute http:// or https:// app base URL with a hostname, without credentials, query parameters, or a fragment.";

/** Never include the supplied value in errors: it may contain credentials. */
export function validateSiteUrl(value = process.env["SITE_URL"]): string {
  const url = value?.trim();
  if (!url) throw new Error(`SITE_URL is not set. ${SITE_URL_FORMAT}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SITE_URL is not a valid HTTP(S) URL. ${SITE_URL_FORMAT}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`SITE_URL must use http:// or https://. ${SITE_URL_FORMAT}`);
  }
  if (
    !/^https?:\/\//i.test(url) || !parsed.hostname ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    url.includes("?") || url.includes("#")
  ) {
    throw new Error(`SITE_URL is not a valid app base URL. ${SITE_URL_FORMAT}`);
  }
  return parsed.href.replace(/\/+$/, "");
}

export const EMAIL_FAILURE_COOLDOWN_MS = 60_000;
export type EmailSendOutcome =
  | "success" | "message_rejected" | "configuration_error" | "temporary_failure";

// Process-local evidence only, never an active probe or a gate on real sends.
let providerState: "unchecked" | "available" | "unavailable" = "unchecked";
let retryAfter: number | null = null;

export function recordEmailSend(outcome: EmailSendOutcome): void {
  // A bad recipient/payload neither establishes availability nor clears an outage.
  if (outcome === "message_rejected") return;
  // Temporary errors cannot erase a known configuration failure.
  if (outcome === "temporary_failure" &&
    providerState === "unavailable" && retryAfter === null) return;
  providerState = outcome === "success" ? "available" : "unavailable";
  retryAfter = outcome === "temporary_failure"
    ? Date.now() + EMAIL_FAILURE_COOLDOWN_MS : null;
}

export function getEmailReadiness() {
  const enabled = Boolean(process.env["RESEND_API_KEY"]);
  let links: "valid" | "invalid" | "not_required" = "not_required";
  if (enabled) {
    try {
      validateSiteUrl();
      links = "valid";
    } catch {
      links = "invalid";
    }
  }
  if (retryAfter !== null && Date.now() >= retryAfter) {
    providerState = "unchecked";
    retryAfter = null;
  }
  const provider = enabled ? providerState : "not_configured";
  return {
    status: links === "invalid" || provider === "unavailable" ? "not_ready" : "ready",
    email: { enabled, links, provider },
  } as const;
}

/** Report configuration before listening, but keep liveness and recovery accessible. */
export function validateEmailStartup(): void {
  const readiness = getEmailReadiness();
  const context = {
    environment: process.env["NODE_ENV"] ?? "unspecified",
    email: readiness.email,
    requiredUrlFormat: SITE_URL_FORMAT,
  };
  if (readiness.email.links === "invalid") {
    logger.error(context, "Email link configuration invalid: SITE_URL must be corrected; /api/readyz returns 503");
  } else if (!readiness.email.enabled) {
    logger.warn(context, "Email delivery disabled: RESEND_API_KEY not configured; SITE_URL validation skipped");
  } else {
    logger.info(context, "Email link configuration valid; provider availability has not been checked");
  }
}
