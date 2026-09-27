# Badger Live

An independent student prototype for discovering real public UW–Madison events on a campus map. Event information comes from [UW Today](https://today.wisc.edu/api-docs/). Badger Live is not an official UW service.

## Run locally

Requires Node 24, Bun 1.4+, and OrbStack (or another Docker-compatible runtime) for the local Supabase database.

1. `bun install --frozen-lockfile`
2. Ensure `.env.local` has `NEXT_PUBLIC_MAPTILER_KEY` set to a public MapTiler key. If creating it for the first time, use `.env.example` as a reference; preserve existing local credentials. The local Supabase URL defaults to port 54322 in development.
3. `bun run db:start`
4. `bun run dev`, then open `http://localhost:3000`. The dev and production-start servers bind to `0.0.0.0`; to open the app on a phone connected to the same Wi-Fi, use `http://<Mac-LAN-IP>:3000` (find the address in the dev-server output or with `ipconfig getifaddr en0`). For the built standalone app, run `PORT=3200 bun run start`; it also binds to `0.0.0.0`.

Location is requested only when someone taps **Locate me**, and each tap asks the browser for a fresh position. Browsers remember a site's granted or denied permission, so a prompt is not shown on every tap after the user has made a choice. Geolocation requires a secure context: localhost works over HTTP, but a phone using the Mac's LAN IP needs a trusted HTTPS URL. The plain-HTTP LAN preview still supports the map and events and explains this limitation when Locate me is tapped.

Supabase Studio is available at `http://127.0.0.1:54323`. To stop the local stack, run `bun run db:stop`. The application connects to local Postgres on port 54322; no remote Supabase project is linked.

Docker (OrbStack): rebuild the local image any time with `docker build --build-arg NEXT_PUBLIC_MAPTILER_KEY="$(sed -n 's/^NEXT_PUBLIC_MAPTILER_KEY=//p' .env.local)" -t badger-live:local .`. Run it at `http://localhost:3001` with `docker run --rm -p 3001:3000 -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres badger-live:local`; port 3000 remains available for the regular dev server. Environment files and local Supabase state are excluded from the build context; the public MapTiler key is injected only into the build stage and compiled into browser assets. Never put a private secret in `NEXT_PUBLIC_*`, and restrict the key's MapTiler Allowed HTTP Origins to production, preview, and local development origins.

## Data behavior

`/api/events?date=YYYY-MM-DD` reads the Supabase local cache first. Cache entries expire after six hours; on a miss/expiry, the server refreshes the official `/events/day/YYYY-MM-DD.json` endpoint (15-minute Next.js revalidation and ten-second timeout) and saves valid normalized records. If Supabase is unavailable, the app continues against UW Today; a prior saved day is used as a visibly stale fallback if UW is also unavailable. `bun run sync:events [YYYY-MM-DD]` explicitly refreshes a day. Each record is validated independently. A missing or invalid coordinate leaves the event in the list without a map pin. Times and the default date use America/Chicago.

Building geometry is a checked-in campus map snapshot. It includes full building footprints, source-designated partial footprints, and point-only campus complexes without inventing polygons. `bun run sync:buildings` refreshes `public/data/uw-campus-buildings.geojson`; users can search each building by its topic tags and read a concise description. The building detail shows every matching event from the selected date and offers Google Maps directions.

## Campus safety

The safety toolbox prioritizes UW's own emergency, alert, police, SAFEwalk, and facilities channels. Immediate emergencies should go to 911. WiscAlerts and BadgerSAFE are the official notification systems; Badger Live does not send push, text, or emergency notifications. UWPD incident reports and event/Clery logs are linked at their original sources and are not copied into the map: the public daily log/feed can contain sensitive, person-specific narratives, and the campus-alert site does not expose a stable location-bearing feed suitable for safe third-party mapping.

Structured environmental reports are stored only in local Supabase by default. Intake has no free-text, photo, identity, or device-location field; location is snapped to a verified campus building. Submissions remain private and never appear on the public map until a human reviewer approves them. Community-confirmed status requires at least two distinct reports plus an explicit reviewer decision and refers only to an environmental condition—not a crime. Reports expire after 14 days; older observations are marked outdated and removed from active map pins. The queue currently has no assigned reviewer.

To later assign reviewers, set `SAFETY_MODERATOR_EMAILS` to a comma-separated list of exact, verified Supabase Auth emails and configure `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Only those existing accounts can review; public sign-up is disabled in the local Supabase config. Keep the allowlist server-only, never put a service-role key in `NEXT_PUBLIC_*`, and provision reviewer accounts through Supabase Studio/admin tools. If no reviewer is configured, reports can be submitted only with a clear private/unmonitored disclosure and cannot be published.

Badger Live does not submit concerns to UW, dispatch responders, or create a facilities work order. The report form is for low-stakes, observable building/environment conditions only; urgent or actionable matters must use the official contacts shown in the toolbox.

The checked-in `src/data/uw-2026-09-26.json` is a verified snapshot of 20 real UW records captured on September 26, 2026. It is only used if that exact date's provider request fails, and the UI labels it as a snapshot. Other provider failures produce an error state; no empty day is invented. The September 26 JSON and HTML views each had 20 event rows when the snapshot was captured.

## Verification

Run `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, and `bun run test:e2e`. Playwright tests use Chromium at desktop and iPhone-size viewports. The MapLibre worker and shared module are copied from the installed package into `public/maplibre/` before development and production builds; the generated files are not committed.

## Scope

Supabase remains local-only: it stores refreshed UW event-day cache snapshots and the private, moderation-gated environmental report queue. No AI summaries, app-delivered push alerts, or incident-log scraping are implemented.
