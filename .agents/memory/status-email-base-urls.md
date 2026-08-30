---
name: Status email base URLs
description: Environment-specific URL rules for buyer order-status emails.
---

Status update emails must use the environment-provided `SITE_URL`; never fall back to the production domain.

**Why:** A production fallback makes development emails point at the wrong instance and prevents reliable end-to-end testing.

**How to apply:** Set `SITE_URL` independently for development and production, and fail clearly before sending if it is missing or is not an HTTP(S) URL.