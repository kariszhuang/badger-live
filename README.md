# Badger Live

An independent student prototype for discovering real public UW–Madison events on a campus map. Event information comes from [UW Today](https://today.wisc.edu/api-docs/). Badger Live is not an official UW service.

## Run locally

Requires Node 24 and npm, or Docker.

1. `npm ci`
2. Create `.env.local` with `NEXT_PUBLIC_MAPTILER_KEY=<your public MapTiler key>`.
3. `npm run dev`, then open `http://localhost:3000`.

Docker: `docker build -t badger-live .` then `docker run --rm -p 3000:3000 badger-live`. `.env.local` is included in a local Docker build context but is ignored by Git. Never put a private secret in `NEXT_PUBLIC_*`; the map key is visible to browsers. Restrict the key's MapTiler Allowed HTTP Origins to production, preview, and local development origins.

## Data behavior

`/api/events?date=YYYY-MM-DD` fetches the official `/events/day/YYYY-MM-DD.json` endpoint server-side with a 15-minute revalidation window and ten-second timeout. Each record is validated independently. A missing or invalid coordinate leaves the event in the list without a map pin. Times and the default date use America/Chicago.

The checked-in `src/data/uw-2026-09-26.json` is a verified snapshot of 20 real UW records captured on September 26, 2026. It is only used if that exact date's provider request fails, and the UI labels it as a snapshot. Other provider failures produce an error state; no empty day is invented. The September 26 JSON and HTML views each had 20 event rows when the snapshot was captured.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`. Playwright tests use Chromium at desktop and iPhone-size viewports. The MapLibre worker and shared module are copied from the installed package into `public/maplibre/` before development and production builds; the generated files are not committed.

## Scope

This release is read-only. Student posts, campus condition reports, accounts, moderation, databases, AI summaries, push notifications, and offline live events are planned for later work and are not represented as active features.
