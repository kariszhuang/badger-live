# Badger Live implementation journal

This is the working record for implementing [the master plan](./Badger_Live_Complete_Master_Plan.md). Keep it current as code lands so the next person can tell what is real, how the parts fit together, and what still needs a project-side action.

## Product boundaries

- Badger Live is an independent UW–Madison campus discovery prototype, not an emergency service or an official UW service.
- There is no login, profile, moderator console, moderation queue, private messaging, or public photo gallery in this release.
- Community publishing is limited to ordinary, non-identifying physical conditions. Community observations stay visibly unverified; an empty map never means a place is safe or accessible.
- Events and the UWPD daily blotter are read-only, source-linked official data. Blotter entries are historical records, not live alerts or findings of guilt.
- Browser location is requested only after a user action. A selected map point or trusted campus place remains available when GPS is denied or imprecise.

## Existing foundation to reuse

- Next.js 16 App Router, TypeScript, Bun, Vitest, Playwright, and Supabase CLI.
- MapLibre full-screen map, checked-in UW campus building geometry, and the existing responsive discovery rail/sheet.
- UW Today event fetch, normalization, cache, and date/category filters.
- The server-side, source-linked UWPD historical blotter integration.
- Local Supabase is available for disposable migration and database checks. The hosted project is not linked in the local Supabase CLI.

## Target architecture

| Area | Responsibility |
|---|---|
| `src/lib/report/` | Input schemas, report categories, deterministic content/location policy, public DTOs, server-only persistence and rate limits. |
| `src/app/api/report/` | One report submission transaction, observational rechecks, limited undo, and inaccurate/outdated flags. |
| `src/app/api/map/` and `src/app/api/places/` | Bounded public map queries and canonical campus-place search. |
| `src/app/api/assistant/` | Read-only source-grounded campus answers; no implicit publish capability. |
| `src/app/api/routes/plan/` | Trusted-place walking directions proxy with rate limits and nearby-report inspection. |
| `supabase/migrations/` | PostGIS-safe public projections, private operational tables, RLS, atomic RPCs, and minimal Broadcast invalidation payloads. |
| `src/components/` | Map layer controls, report composer and receipt, location picker, assistant and walking-route sheets, hazard markers, and source-linked event cards. |

All write routes fail closed when required database, HMAC, model/moderation, or write-enable settings are absent. The browser receives only public Supabase configuration. Raw report text and original images are not persisted or included in public data.

## Work ledger

| Slice | Status | Notes |
|---|---|---|
| Repository audit and branch | Complete | Work is on `feature/reporting`; the pre-existing `scripts/sync-events.ts` edit and user-provided master plan are preserved. |
| Safe report domain and database | Implemented locally | Sanitized PostGIS tables, private operational schema, origin/body/location checks, persistent HMAC limits, atomic idempotent RPC, undo, flags, freshness windows, rechecks, manual hide, and retention migrations. Hosted project is untouched. |
| Map/report/assistant UI | Implemented; reviewed in built-in browser | Location-first composer with GPS/pin/place options, privacy-safe image preparation, safe map layer, visible uncertainty/lifecycle, duplicate choices, receipt, and read-only Ask Badger sheet. Tested as a narrow mobile viewport with real local place search. |
| Read-only assistant and event tools | Implemented; live model unverified | Answers use date-filtered UW Today data, safe observations, campus places, optional historical blotter sources, strict structured output, and source-ID allowlisting. Offline prompt-contract tests pass. |
| Public Broadcast and resilience | Implemented and locally verified | Broadcast contains only ID/version/kind; clients debounce then refresh canonical map data and reconcile on focus, visibility, subscription, and timed polling. The local trigger and invalidation parser were checked. |
| Import/cron and route planning | Implemented; provider setup required | Event import and expiry have bearer-protected endpoints and production schedules. `/api/routes/inspect` handles bounded supplied geometry; the planner resolves two trusted place IDs, requests walking geometry server-side when `OPENROUTESERVICE_API_KEY` is set, and inspects nearby active community reports. The client never submits GPS to the provider. Local browser review verified place search and the no-key message; mocked API/browser tests cover warning presentation. A live OpenRouteService response remains unverified. |
| Documentation and demo readiness | Complete for local implementation | README, deployment setup, reporting architecture, prompt contract tests, and this journal document the architecture, local workflow, operational boundaries, and hosted setup still required. |

## Acceptance audit follow-up

- Location resolution is deterministic and covered independently from the model: an explicitly selected map pin wins, then a trusted named place, a valid prior issue for relative wording, an explicitly selected trusted place, and finally fresh GPS only when the issue says `here`. Missing or unresolved location no longer silently inherits the reporter's GPS point.
- Report intake sends at most 20 text-matched trusted places plus the selected place to the model, with at most 8 aliases per place. The full cached catalog stays server-side.
- The safety sheet now has source-linked UWPD and University Housing lost-property guidance. The deployment guide has an exact-ID/exact-title procedure for deleting demo rows safely.
- Route-level tests exercise one-request multi-issue publication, relative issue location inheritance, location follow-up instead of GPS fallback, pin/place precedence, person-allegation rejection before model calls, and duplicate choice without an early write. Pure location tests cover six precedence and fallback cases.
- The single-send product flow deliberately runs semantic intake inside `/api/report/publish` so one explicit Send can screen, interpret, deduplicate, and commit atomically. `/api/report/interpret` remains a read-only Ask-mode extraction helper; it is not an extra report-composer round trip.
- Report and assistant sheets now disclose that their inputs and selected campus data are sent to OpenAI; local persistence/public display limits are stated in the UI and README.
- The production `interpretReport` request is shared with a developer-only live prompt-evaluation CLI. Eight synthetic scenarios cover multi-issue extraction, location precedence, follow-up, Ask mode, emergency handling, and instruction injection. The script cannot publish or call the database; its scorer has offline unit tests.
- Added `bun run audit:client-bundles` to load environment files using Next.js precedence and scan browser-facing build assets and prerendered responses for raw configured server-only values. It reports only variable names, never values, and requires the same build environment to have the relevant secrets configured. Encoded or transformed values are outside this check's scope.
- Route geometry is accepted only when it has 2–5,000 coordinates, stays inside campus map bounds, and is at most 10 km. `/api/routes/plan` resolves catalog IDs server-side and returns a clear missing-provider error instead of a fabricated path. The map creates its route source and line layers only after receiving a usable candidate, which keeps map startup and campus-building setup independent.

## Verification ledger

Verification on the current branch:

- On the current changes, `bun run lint`, `bun run typecheck`, and `bun run test` (22 files / 98 tests) passed; the suite includes both client-bundle audit regression cases. `BADGER_NEXT_DIST_DIR=.next-verify bun run build` also passed; the separate ignored output directory kept the pre-existing local dev server's `.next` cache intact.
- The client-bundle audit passed on 131 browser-facing build assets. Production mode had no server-only comparison values configured; development mode loaded and checked one server-only value. The automated synthetic leak case correctly fails with exit code 1 and names `DATABASE_URL` without printing its configured value. This raw-string scan cannot detect encoded or transformed values.
- All four migrations applied successfully to the disposable local Supabase instance. The expiry job is registered as `badger-live-expire-hazards` on `*/10 * * * *`. Manual database checks covered atomic two-item publish, idempotent retry, denied anonymous writes/private access, and minimal trigger payload.
- Prompt tests check guardrail text and source contracts only; no OpenAI API key/model was present, so no live GPT-6 Luna trial has run.
- `bun run eval:report-prompt -- --repeats 3` is ready for live GPT-6 Luna evaluation. It was not run because no `OPENAI_API_KEY` or `OPENAI_REPORT_MODEL` is configured. See [the prompt evaluation record](./prompt-evaluation.md).
- Running that CLI without the required credentials returned its explicit no-request status before making any network call.
- `bun run db:status`: local Supabase is running; its CLI reports no linked hosted project.
- Built-in browser review at 390×844 covered the live campus map and building footprints, route place search and the safe no-provider-key message, plus the Ask Badger sheet and quick-question affordance. No browser GPS permission was granted. MapTiler's style emitted a missing `transportation:road_` image warning; the base map, event markers, and building footprints rendered.
- Additional built-in browser review on the desktop map verified the report composer, graceful GPS denial, map-pin selection, the new OpenAI data-use notice, and Ask Badger's read-only/privacy copy. Place search on the already-running local Next server returned 503 because its inherited `DATABASE_URL` in `.env.development.local` points to a remote host that is unavailable. No write endpoint was called; further DB-backed manual checks were stopped pending an isolated local-DB app configuration.
- A fresh local production build preview rendered the campus event map and its official event list. Visual browser checks covered Ask Badger's read-only/privacy copy and emergency warning, quick-question field fill (without submitting), and the linked official safety/help sheet. No report was published and no assistant question was submitted.
- Final full Playwright run: `bun run test:e2e --workers=1` passed 55 tests with 3 expected desktop skips for mobile-only sheet checks. The run also verified that successful mocked route planning posts only trusted place IDs, renders the nearby unverified warning and clears the candidate route. Running this MapLibre-heavy suite with more workers can starve browser evaluation and cause timeout noise; use one worker when you need a stable acceptance run.
- The first full run after adding route layers exposed that empty route layers created during map startup prevented campus-building readiness. Creating those layers only when a candidate route exists fixed the issue; focused desktop/mobile checks and the subsequent complete suite passed.
- The local database path and browser code are verified, but a two-device staging session, a live OpenAI request, actual phone location behavior, and hosted deployment remain unverified and must be checked with project credentials before enabling writes.

Before each implementation commit, rerun the repository-required lint, typecheck, unit tests, and build checks. Do not include unrelated pre-existing user edits in those commits.

See the [acceptance matrix](./acceptance-matrix.md) for scenario-by-scenario evidence and external checks still outstanding.

## External setup still to verify

- Provide an OpenAI API key and verify the documented `gpt-6-luna` model is enabled for the intended project. The source allows `OPENAI_REPORT_MODEL` to be configured rather than hard-coding the model. Until a live call is run, prompt behavior is contract-tested but model behavior is not verified.
- Confirm server-only HMAC keys, a production database URL, rate-limit backing, public MapTiler origin restrictions, and the write kill switch before enabling public submissions.
- Hosted Supabase migrations, Vercel variables, and production deployment have not been changed by this implementation work.
