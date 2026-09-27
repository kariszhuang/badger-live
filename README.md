# Badger Live

Badger Live is an independent UW–Madison campus discovery prototype. It brings together the official UW Today event calendar, a source-linked historical UWPD blotter, campus buildings, verified help links, and unverified community observations about physical conditions. It is not affiliated with UW–Madison and is not an emergency service.

## Run locally

Requires Node 24 and Bun 1.4+. MapLibre uses the public OpenFreeMap style by default; a domain-restricted MapTiler key is optional.

1. Run `bun install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local` only if `.env.local` does not already exist. Preserve ignored local environment files and existing credentials.
3. Start with `bun run dev` and open `http://localhost:3000`.

The map and official event calendar can be explored without AI or report writes. Local report publication needs a local Supabase database, seeded campus places, an OpenAI API key and configured model, two server-only HMAC keys, and `REPORT_WRITES_ENABLED=true`. See [local setup and deployment](docs/deployment.md) before enabling writes. Never put a server secret in a `NEXT_PUBLIC_*` variable.

Location is requested only after **Report here** is chosen. GPS is a one-time browser reading; it is not continuously shared. A selected point or trusted campus place is available when GPS is denied or too imprecise. Map selection and browser geolocation require a secure context; localhost works over HTTP, while a phone on a LAN address needs HTTPS.

Optional local Supabase commands:

- `bun run db:start` starts the local stack.
- `bunx supabase migration up --local` applies pending migrations without resetting local data.
- `bun run sync:places` loads the checked-in trusted campus place catalog.
- `bun run sync:events [YYYY-MM-DD]` refreshes a requested official calendar day.
- `bun run db:stop` stops the local stack.

Report expiry runs every ten minutes through Supabase Postgres Cron. Vercel only warms the event cache once daily; event cache misses refresh UW Today on demand.

Supabase Studio is available at `http://127.0.0.1:54323`. The app does not silently switch a configured hosted database to local Postgres or vice versa.

## Product boundaries

- No accounts, login, user profiles, moderator console, human review queue, private messaging, or public report photos.
- Report mode is an explicit publish action. Ask Badger is read-only until a user chooses **Post this as a report**.
- Only templated, non-identifying physical-condition reports can reach the public map. Accepted original text and optional photos are retained privately for seven days; they are never returned publicly.
- Optional voice dictation starts only when tapped. The browser's speech service may process microphone audio; Badger Live receives transcript text, which is sent to OpenAI only when the user taps **Send report**.
- Report text and optional photos are sent to OpenAI for analysis and retained privately for seven days after a report is accepted. Ask Badger questions and selected campus source data are sent to OpenAI but are not stored by Badger Live. Public reports contain only constrained issue details and approximate location.
- Community observations are always unverified. Anonymous counts are not unique or trustworthy people, and no clear result means a place is safe or accessible.
- Verified official event and help links remain separate from community observations. UWPD blotter entries are historical source records, not live alerts or findings of guilt.

## Existing data sources

`/api/events?date=YYYY-MM-DD` uses the official UW Today calendar. The normalized cache expires after six hours; cache misses refresh UW Today, and a saved day is shown as stale only when the source is unavailable. `bun run sync:events [YYYY-MM-DD]` refreshes an explicitly requested date. Each event is validated independently; events without verified coordinates stay in the list without a map pin. Dates use America/Chicago.

Campus building geometry is a checked-in map snapshot. `bun run sync:buildings` refreshes it. The official safety panel links to UW emergency, alert, police, SAFEwalk, and facilities channels. Crime mode displays a limited, filtered, source-linked view of the public UWPD historical blotter; a pin names a campus building, not an exact incident location.

The map's **Check walking route** tool searches two trusted campus places and asks the server for an OpenRouteService walking candidate. The client does not submit GPS to that provider. Active unverified observations near the candidate route appear as warnings; a clear result never establishes safety or accessibility. Configure the optional server-only `OPENROUTESERVICE_API_KEY` to enable live directions; without it, Badger Live does not invent a route.

Use the [master-plan acceptance matrix](docs/acceptance-matrix.md) to distinguish local evidence from hosted/device checks, and the [report prompt evaluation guide](docs/prompt-evaluation.md) to run repeatable GPT-6 Luna evaluations when project credentials are available.

## Verification

Run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`. After a build, `bun run audit:client-bundles` uses Next.js environment-file precedence to scan browser-facing assets for raw configured server-only values without printing the values. Playwright browser checks are available with `bun run test:e2e`. E2E needs live map tiles and the official calendar unless a test provides fixtures. The MapLibre worker is copied from its installed package before development and production builds; generated files are not committed.

Implementation details, endpoint behavior, privacy limits, and manual takedown steps are in [the reporting architecture guide](docs/reporting-architecture.md). External environment setup and migration guidance are in [deployment and Supabase setup](docs/deployment.md). The ongoing build record is [the implementation journal](docs/implementation-journal.md); the supplied master plan remains the product specification.
