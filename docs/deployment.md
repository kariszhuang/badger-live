# Local setup and deployment

This guide describes the no-login implementation in this branch. The hosted Supabase project and Vercel deployment have not been changed or verified as part of this work. Do not enable public writes in production until the project-specific setup below has been completed and checked.

## Local development

1. Install with `bun install --frozen-lockfile`.
2. Keep any existing ignored `.env.local` or `.env.development.local` files unchanged. If `.env.local` does not exist, copy `.env.example` to `.env.local` and fill only local development values.
3. `bun run dev` starts the app on port 3000. The public UW calendar and map work without report configuration.

For local database-backed reporting, run `bun run db:start`, then `bunx supabase migration up --local`, followed by `bun run sync:places`. Set `DATABASE_URL` to the local Postgres connection, and set `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the local Supabase setup for public Realtime. The public key is used only for Broadcast subscriptions; app reads and writes go through bounded Next.js routes and the server-side Postgres connection.

Create separate random values of at least 32 bytes for `REPORT_FINGERPRINT_HMAC_KEY` and `REPORT_CAPABILITY_HMAC_KEY`. Set `OPENAI_API_KEY` and an `OPENAI_REPORT_MODEL` ID available to that OpenAI project. `OPENAI_ASSISTANT_MODEL` is optional and falls back to `OPENAI_REPORT_MODEL`. Keep `REPORT_WRITES_ENABLED=false` while configuring. Only set it to `true` after the database migration and place sync succeed, the model and moderation endpoint are available, and all four required verification commands pass.

Local database commands:

- `bun run db:start` starts the disposable Supabase stack.
- `bunx supabase migration list --local` checks which local migrations are applied.
- `bunx supabase migration up --local` applies pending migrations without clearing local data.
- `bun run db:reset` destroys and recreates local database state; use it only when that reset is intended.
- `bun run sync:places` idempotently loads the checked-in trusted campus places.
- `bun run db:stop` stops the local stack.

Do not run `bun run db:status` in a shared transcript: Supabase CLI status output can include local credentials. Studio is at `http://127.0.0.1:54323` while the local stack is running.

## Production environment

Use separate projects and credentials for production and preview/staging. Required app variables:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPTILER_KEY` | Browser | Optional public tile key. Restrict allowed origins; OpenFreeMap is the fallback. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Supabase Realtime endpoint. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | Public Broadcast subscription only; never grants write authority. |
| `DATABASE_URL` | Server secret | Direct Postgres/Session Pooler connection for the app's parameterized SQL and transactions. |
| `OPENAI_API_KEY` | Server secret | Report moderation, structured intake, and Ask Badger. |
| `OPENAI_REPORT_MODEL` | Server configuration | Defaults to documented `gpt-6-luna`; verify project access before use. |
| `OPENAI_ASSISTANT_MODEL` | Server configuration | Optional separate read-only assistant model. |
| `REPORT_FINGERPRINT_HMAC_KEY` | Server secret | HMAC key for pseudonymous visitor/network rate-limit buckets and request digests. |
| `REPORT_CAPABILITY_HMAC_KEY` | Server secret | HMAC key for report IDs and undo capabilities. |
| `REPORT_WRITES_ENABLED` | Server configuration | Must be the exact string `true` to enable report writes. Defaults off. |
| `CRON_SECRET` | Server secret | Random bearer credential for the scheduled event import route. |

Keep the two HMAC keys and cron credential independent. Never put a database URI, OpenAI key, HMAC key, or cron secret in a `NEXT_PUBLIC_*` variable. This app uses the server-only Postgres URI instead of a Supabase service-role key.

OpenAI's current model page lists `gpt-6-luna` for the Responses API and Structured Outputs, with image input support. That verifies the code path's documented model capability; API-key access in the intended project remains unverified until a live request succeeds. [OpenAI GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

Before opening preview traffic, use a separate staging database. Never connect previews or pull-request deployments to production report data. Apply the reviewed migrations and idempotent place seed, verify that public roles can select only the safe public tables, and verify direct public inserts and all private-table access are denied. Keep `REPORT_WRITES_ENABLED=false` until the staging application, model settings, Broadcast subscription, expiry job, and all required checks have been verified.

## Production migration sequence

The manual GitHub Actions workflow in `.github/workflows/supabase-migrations.yml` requires `SUPABASE_DB_URL` in the `supabase-production` GitHub environment. It previews pending migrations by default and applies only when explicitly dispatched with `apply=true`.

1. Back up the production database and confirm the migration history, PostGIS schema, and existing public grants.
2. Review each pending SQL migration, including both no-login hazard migrations, against a production-like staging project.
3. Run the workflow with `apply=false` and inspect the dry-run output.
4. Apply to staging and verify the resulting schema, RLS, function grants, public Broadcast invalidation, and a representative report transaction.
5. Only after staging and deployment review, explicitly run the workflow with `apply=true` for the intended project.
6. Seed trusted campus places with `bun run sync:places` pointed at the intended database, deploy the app with all server secrets, and confirm reads and cron authentication while writes remain disabled.
7. Enable `REPORT_WRITES_ENABLED=true` only after a successful manual smoke test and the public-role checks below.

The production project is not linked to the local Supabase CLI, and no hosted migration has been applied or verified during this task. Do not assume current remote state from old deployment notes.

## Scheduled jobs

`supabase/migrations/20260928030000_schedule_report_expiry.sql` enables Supabase Postgres Cron and schedules report expiry every ten minutes. This keeps category TTLs and the one-day stale window accurate without relying on a Vercel plan that supports frequent jobs. The migration is local-tested; apply and verify it on staging before production.

`vercel.json` schedules `/api/cron/import-events` once per day at 04:15 UTC. This is compatible with Vercel Hobby, which allows each cron job to run only once per day; see [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing). Vercel invokes configured cron jobs on production deployments, not previews, and sends `CRON_SECRET` as the bearer authorization value. The import endpoint rejects requests unless that value exists and matches. Event cache misses also refresh UW Today on demand, so this schedule is a cache warm-up rather than the only source of fresh events.

The import refreshes the current America/Chicago date and the following seven event dates. It writes event cache rows and a private import-run record; on a source or database error, it preserves prior cached data and returns an error. Postgres expiry marks newly expired reports stale for a one-day display window, then removes them from the public read model; the underlying safe row remains retracted as history.

## Security and operations checks

- Public browser code has only `NEXT_PUBLIC_*` values. The browser never receives a Postgres connection or a capability hash.
- RLS and grants allow public reads of sanitized tables only. Private operational data lives in the non-exposed `internal` schema. All inserts, updates, and deletion operations use server-only SQL functions.
- `REPORT_WRITES_ENABLED=false` turns off publish, recheck, undo, and flag routes. Set it back to false immediately if abuse or operational failures appear.
- Public reports contain a fixed category title, approximate point/place, user-reported severity, timestamps, anonymous count, and lifecycle. They do not contain original text, original images, contact details, or a person identity.
- Use the trusted SQL editor for a developer takedown. Review the exact report ID first:

  ```sql
  update public.hazard_reports
  set lifecycle = 'hidden', version = version + 1, updated_at = now()
  where id = '<reviewed-report-uuid>';
  ```

- The app makes no independent-person claim: HMAC rate limits reduce accidental repetition but browsers, networks, and visitor IDs can be spoofed or shared.
- Report and assistant endpoints depend on an external OpenAI project. If configuration or moderation is unavailable, report publication fails closed and the map remains read-only.
- Before an open-campus launch, add a staffed takedown/abuse-response path or reduce public publishing to a more restrictive policy. The no-login prototype is not professional moderation.

## Verification

Before every implementation commit, run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`. Use `bun run test:e2e` for browser acceptance checks. E2E currently expects a standalone build, live MapLibre tiles, and official calendar behavior. For manual two-browser testing, use two separate browser profiles against the same staging/local app and verify that broadcast messages only trigger a canonical safe API refresh.
