# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required environment variables:
  - `DATABASE_URL` — Postgres connection string (provided by Replit)
  - `SITE_URL` — public base URL used in buyer order-status email links. It is configured in the API service definition at `artifacts/api-server/.replit-artifact/artifact.toml`:
    - Development derives it from Replit's runtime-managed `REPLIT_DEV_DOMAIN`
    - Production sets it to the deployment's primary URL
  - `RESEND_API_KEY` — Resend API key required to send email
  - `ADMIN_EMAIL` — recipient address for admin notifications

`SITE_URL` must be an absolute `http://` or `https://` app base URL with a hostname, without credentials, query parameters, or fragments. When email is enabled, startup validates it and logs the environment and required format, never the supplied URL. Invalid configuration prevents status-update emails without stopping the API.

- `/api/healthz` is liveness only and remains 200 during email failures.
- `/api/readyz` reports **email-only** readiness (not database readiness): 503 for invalid email links or a failed last send; 200 for valid configuration or intentionally disabled email (no `RESEND_API_KEY`).
- `email.links` distinguishes `invalid`, `valid`, and `not_required`. `email.provider` distinguishes `not_configured`, `unchecked`, `available`, and `unavailable`. Provider status reflects the last send in this process, not an active probe: a rejection or network failure sets `unavailable`, a subsequent success clears it. `unchecked` does not guarantee delivery, and `unavailable` does not necessarily indicate a provider-wide outage. Startup and health checks never send test emails.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
