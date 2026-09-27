# Deployment and Supabase

## App deployment

The Vercel Git integration watches `main` and creates deployments from pushes. GitHub Actions runs the CI checks in `.github/workflows/ci.yml`. A Vercel Git deployment is not automatically blocked by a failed GitHub workflow unless Deployment Checks are enabled for the Vercel project. Configure the successful `CI / test` check as a required Deployment Check before relying on `main` as a production gate.

After a deployment, check the Vercel deployment status and request the public site and `/api/events?date=2026-09-26` to confirm it is serving the expected build.

## Supabase environments

The app uses a public Supabase URL and publishable key for Auth. It uses a private Postgres connection for the UW event cache and safety-report store; the publishable key cannot write to those tables. Never use a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable.

For local development, `.env.development.local` is ignored by Git and contains the hosted project URL, publishable key, and database URI. Never copy its database password or full URI into source files or chat. To use the local database instead, set the local Supabase URL and local Postgres URL from `.env.example`; the app deliberately does not silently fall back to local Postgres when configured with hosted Auth.

These variables are currently configured in the Badger Live Vercel Production environment:

- `NEXT_PUBLIC_SUPABASE_URL` — the hosted project URL (public config).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the public publishable key (public config).
- `DATABASE_URL` — the supplied Supabase shared Session Pooler URI (port 5432), stored as a Vercel Production secret. The app uses Postgres.js transactions; its current driver has a documented caveat with Supabase's shared transaction pooler. The client is module-scoped, limited to one connection, and disables prepared statements. Session mode is a practical fit for this low-volume deployment; monitor connections before scaling and revisit the driver/pooler choice.

To configure these in a new environment, add the two `NEXT_PUBLIC_*` values and the server-only `DATABASE_URL` under Vercel **Project → Settings → Environment Variables**. Scope `DATABASE_URL` only to Production until a separate staging database exists. Environment changes apply to new deployments, not deployments that are already built; redeploy and verify the new deployment afterward. The database URI must never use a `NEXT_PUBLIC_*` name.

The following safety settings are not currently configured in Vercel Production:

- `SAFETY_REPORT_HASH_SECRET` — optional long random server-only HMAC key for report rate limiting. If omitted, the server derives this key from `DATABASE_URL`; set a distinct value when establishing a production secret-rotation routine.
- `SAFETY_MODERATOR_EMAILS` — server-only comma-separated allowlist of exact, verified moderator accounts. It is intentionally unset until human reviewers are appointed. Until then, the moderation endpoint returns an unavailable response and reports remain private.

Do not point Preview deployments at the production safety-report database. Until a separate staging project is available, leave `DATABASE_URL` unset in Preview; public events continue to load, while database-backed reporting stays unavailable.

## Applying database migrations

Migrations in `supabase/migrations/` are additive and restrictive: public roles have no access to the private tables. The manual `Supabase migrations` workflow previews pending changes by default and applies them only when dispatched with `apply=true`.

1. In Supabase **Connect**, copy the exact **Session Pooler** connection string for the project. Preserve its host and username and URL-encode any special characters in the password. This mode is used by the current Postgres.js migration tool and is compatible with its transaction usage.
2. Keep the URI as the `SUPABASE_DB_URL` secret on the GitHub `supabase-production` environment. The secret is environment-scoped rather than repository-wide. Reviewers are intentionally unassigned for now, so this is not approval-gated; only dispatch with `apply=true` when a production apply is intended.
3. Run the `Supabase migrations` workflow once with `apply=false`; inspect its dry-run output.
4. Dispatch it again with `apply=true` to apply the pending SQL migrations.
5. Keep Vercel Production's `DATABASE_URL` as the server-only Session Pooler URI. A new deployment is required after changing it. Never put the database URI into a `NEXT_PUBLIC_*` variable.

The GitHub workflow requires no Supabase personal access token because it connects directly using the database URI. Do not enable automatic production migrations until the secret, environment protection, and deployment ordering have been verified. If a migration changes existing schema or data, review and test that migration separately before applying it.

For future schema changes, create an additive migration under `supabase/migrations/`, test it against a fresh local stack with `bun run db:reset`, then run the GitHub production migration workflow with `apply=false` and inspect the SQL/dry-run before applying with `apply=true`. Deploy application code that depends on the new schema only after the migration succeeds. Keep changes backward-compatible during rollout; do not edit production tables manually in the dashboard as a substitute for a migration.

On 2026-09-27, the two checked-in migrations were applied to the hosted database through the supplied Session Pooler URI, and local and remote migration histories were verified to match. The schema includes `uw_event_days`, `safety_reports`, and `safety_moderation_events`. A production dry-run of the GitHub workflow also succeeded with no pending migrations. `uw_event_days` is prewarmed for September 26 (20 official events) and September 27 (10); safety tables correctly remain empty until users submit reports and a reviewer is assigned.

After a production deployment, verify `/api/events?date=YYYY-MM-DD` returns `cacheStatus: "supabase"`. For a previously uncached date, a successful upstream fetch and database upsert should also return that status; request it again and confirm the same `fetchedAt` is served from the persisted cache. `cacheStatus: "live"` means the app could not use the database cache. Verify `/api/safety/reports` returns an empty list while no reports exist, and that `/api/safety/moderation` stays unavailable until moderators are explicitly assigned.

## Future Supabase work

Recommended order:

1. Before the next production migration, run the manual workflow with `apply=false`, review the SQL and dry-run, then explicitly dispatch with `apply=true`. Recheck the resulting schema and restrictive RLS policies in Supabase.
2. Create a separate Supabase staging project. Point Preview deployments and pull-request tests at staging or disposable local Supabase—not production—and exercise both migration-up and rollback/recovery procedures.
3. Assign named human moderators before publishing community reports. Keep report intake private by default, grant reviewer access through narrowly scoped server-side authorization and RLS, audit every decision, and test that anonymous/public roles cannot read pending reports or moderation history.
4. Add operational safeguards before accepting substantial user data: scheduled backups and restore drills, retention/deletion jobs, migration ownership/review, and alerts for database failures and stale event-cache refreshes.
5. Add new product data only through reviewed, additive SQL migrations with Zod/type updates and tests. Keep the official calendar cache separate from user reports; never let previews or public credentials write privileged data to production.

Do not add a service-role key to browser variables, enable public reads of pending safety reports, or turn on unattended production migrations as a shortcut.

## Local database and CI

`bun run db:start` and `bun run db:reset` use the local Supabase stack. GitHub CI starts an ephemeral local stack and applies repository migrations before lint, typecheck, unit tests, and build. Browser E2E tests remain available through `bun run test:e2e`; they are not part of the deployment check yet because they depend on MapTiler tiles and live calendar data. `bun run sync:events [YYYY-MM-DD]` refreshes one official calendar date in the explicitly configured database and refuses to guess a database if `DATABASE_URL` is missing. The server lazily refreshes cache misses and entries older than six hours. The local stack is useful for migration development; it is not the hosted database.
