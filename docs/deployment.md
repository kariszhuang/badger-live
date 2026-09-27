# Deployment and Supabase

## App deployment

The Vercel Git integration watches `main` and creates deployments from pushes. GitHub Actions runs the CI checks in `.github/workflows/ci.yml`. A Vercel Git deployment is not automatically blocked by a failed GitHub workflow unless Deployment Checks are enabled for the Vercel project. Configure the successful `CI / test` check as a required Deployment Check before relying on `main` as a production gate. The Vercel account connected to this task was not available to the deployment tools, so that project-side setting could not be changed here.

After a deployment, check the Vercel deployment status and request the public site and `/api/events?date=2026-09-26` to confirm it is serving the expected build.

## Supabase environments

The app uses a public Supabase URL and publishable key for Auth. It uses a private Postgres connection for the UW event cache and safety-report store; the publishable key cannot write to those tables. Never use a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable.

For local development, `.env.development.local` is ignored by Git and already contains the provided hosted project URL and publishable key. Add `DATABASE_URL` there using the exact connection string from Supabase **Connect**. Do not paste the database password or full URI into source files or chat. When using the hosted project from an IPv4-only network, choose the project's pooler rather than guessing its hostname. If the hosted URL is configured without `DATABASE_URL`, the app deliberately does not fall back to the local database; event caching is unavailable and safety-report storage fails closed.

Set these values in Vercel Project Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` — the hosted project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the public publishable key.
- `DATABASE_URL` — a pooled Postgres connection string for production. Use transaction mode for the serverless app runtime and `prepare: false` (already configured in the Postgres client).
- `SAFETY_REPORT_HASH_SECRET` — a long random server-only value used to rate-limit anonymous reports.
- `SAFETY_MODERATOR_EMAILS` — optional, server-only allowlist of exact, verified moderator accounts. Leave unset until reviewers are appointed.

Do not point Preview deployments at the production safety-report database. Until a separate staging project is available, leave `DATABASE_URL` unset in Preview; public events continue to load, while database-backed reporting stays unavailable.

## Applying database migrations

Migrations in `supabase/migrations/` are additive and restrictive: public roles have no access to the private tables. The manual `Supabase migrations` workflow previews pending changes by default and applies them only when dispatched with `apply=true`.

1. In Supabase **Connect**, copy the exact **Session Pooler** connection string for the project. Preserve its host and username and URL-encode any special characters in the password.
2. Keep the complete URI in GitHub Actions as `SUPABASE_DB_URL`, and create the `supabase-production` GitHub Environment with maintainer restrictions and required reviewers before dispatching. The repository-level secret exists, but GitHub currently has no `supabase-production` environment, so the workflow is not yet approval-gated.
3. Run the `Supabase migrations` workflow once with `apply=false`; inspect its dry-run output.
4. Dispatch it again with `apply=true` to apply the pending SQL migrations.
5. Set Vercel Production's `DATABASE_URL` separately to the runtime pooler URI, then redeploy so the function receives it.

The GitHub workflow requires no Supabase personal access token because it connects directly using the database URI. Do not enable automatic production migrations until the secret, environment protection, and deployment ordering have been verified. If a migration changes existing schema or data, review and test that migration separately before applying it.

On 2026-09-27, the two checked-in migrations were applied to the hosted database through the supplied Session Pooler URI, and the local and remote migration histories were verified to match. The remote schema now includes `uw_event_days`, `safety_reports`, and `safety_moderation_events`. The GitHub repository secret `SUPABASE_DB_URL` is configured for the manual workflow, but the `supabase-production` environment still needs to be created and protected. The workflow has not yet been dispatched from GitHub; the remote apply was performed and verified directly from the local CLI.

## Future Supabase work

Recommended order:

1. Before the next production migration, run the manual workflow with `apply=false`, review the SQL and dry-run, then explicitly dispatch with `apply=true`. Recheck the resulting schema and restrictive RLS policies in Supabase.
2. Create a separate Supabase staging project. Point Preview deployments and pull-request tests at staging or disposable local Supabase—not production—and exercise both migration-up and rollback/recovery procedures.
3. Assign named human moderators before publishing community reports. Keep report intake private by default, grant reviewer access through narrowly scoped server-side authorization and RLS, audit every decision, and test that anonymous/public roles cannot read pending reports or moderation history.
4. Add operational safeguards before accepting substantial user data: scheduled backups and restore drills, retention/deletion jobs, migration ownership/review, and alerts for database failures and stale event-cache refreshes.
5. Add new product data only through reviewed, additive SQL migrations with Zod/type updates and tests. Keep the official calendar cache separate from user reports; never let previews or public credentials write privileged data to production.

Do not add a service-role key to browser variables, enable public reads of pending safety reports, or turn on unattended production migrations as a shortcut.

## Local database and CI

`bun run db:start` and `bun run db:reset` use the local Supabase stack. GitHub CI starts an ephemeral local stack and applies the repository migrations before lint, typecheck, unit tests, and build. Browser E2E tests remain available through `bun run test:e2e`; they are not part of the deployment check yet because they depend on MapTiler tiles and live calendar data. The local stack is useful for migration development; it is not the hosted database. To point local development back to the local stack, use `http://127.0.0.1:54321` and the local CLI's publishable key, plus the local Postgres URL, in a local-only environment file.
