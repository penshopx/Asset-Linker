# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Release validation (`Project`) runs `simulator-tests`, `mobile-tests`, and `simulator-typecheck` together. Keep `simulator-typecheck` registered as `pnpm --filter @workspace/lkut-simulator run typecheck`; simulator TypeScript errors must fail the release check independently of runtime test results.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/api-server run test` — API quality gate, including real PostgreSQL order-idempotency contracts. Requires `initdb`, `pg_ctl`, and `psql` on PATH (run as a non-root user); missing tools fail the gate, not skip it. Tests create disposable local clusters and never use Supabase credentials or production data.
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required environment variables:
  - `DATABASE_URL` — Postgres connection string (provided by Replit)
  - `SITE_URL` — public base URL used in buyer order-status email links. It is configured in the API service definition at `artifacts/api-server/.replit-artifact/artifact.toml`:
    - Development derives it from Replit's runtime-managed `REPLIT_DEV_DOMAIN`
    - Production sets it to the deployment's primary URL
  - `RESEND_API_KEY` — Resend API key required to send email
  - `ADMIN_EMAIL` — recipient address for admin notifications
  - `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase credential required for proof cleanup and startup migrations. Never use a `VITE_`/`EXPO_PUBLIC_` prefix or expose it in client code.

Proof uploads return 503 before any bytes are stored if the server-only credential or cleanup reservation is unavailable. Cleanup polls every minute, retries failed removals after a five-minute lease without a retry cap, and recovers abandoned upload reservations after one hour. Apply `artifacts/api-server/migration.sql` when bootstrapping the Supabase project; cleanup RPCs and the migration helper must be executable only by `service_role`, not public/anonymous clients.

`SITE_URL` must be an absolute `http://` or `https://` app base URL with a hostname, without credentials, query parameters, or fragments. When email is enabled, startup validates it and logs the environment and required format, never the supplied URL. Invalid configuration prevents status-update emails without stopping the API.

- `/api/healthz` is liveness only and remains 200 during migration or email failures.
- `/api/readyz` combines startup migration and email readiness. `database.migrations` reports `pending` before completion and throughout retries, `succeeded` after successful migration, or `failed` after a terminal error (including missing helper or exhausted retries). Pending/failed migrations always return 503, even when email is disabled. Once migrations succeed, email readiness still determines whether the response is 200 or 503. This reports startup outcomes, not ongoing database connectivity; neither health endpoint queries the database.
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
