---
name: Status email base URLs
description: Environment-specific URL rules for buyer order-status emails.
---

Status update emails must use the environment-provided `SITE_URL`; never fall back to the production domain.

**Why:** A production fallback makes development emails point at the wrong instance and prevents reliable end-to-end testing.

**How to apply:** Set `SITE_URL` independently for development and production, and fail clearly before sending if it is missing or is not an HTTP(S) URL.

Keep email configuration validation non-fatal to the API process; report email readiness separately from liveness.

**Why:** Status changes are saved independently of best-effort email delivery. Killing the API for a broken email link would also prevent unrelated requests and access to diagnostics.

**How to apply:** Preserve this separation when expanding readiness checks. Do not interpret a configured provider key as proof that delivery works, or send real buyer emails just to probe startup health.