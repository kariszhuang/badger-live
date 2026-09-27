# Master plan acceptance matrix

This is the implementation tracker for [`Badger_Live_Complete_Master_Plan.md`](./Badger_Live_Complete_Master_Plan.md). The supplied plan is kept intact. “Local verified” means supported by local code review, automated checks, local database checks, or the built-in browser; it does not mean hosted or phone behavior has been proven.

## Definition of done

| Requirement | Status | Evidence and remaining limit |
|---|---|---|
| No accounts, profiles, moderator UI, private messaging, or public photo gallery | Local verified | Product routes and UI stay within the plan's scope. See [README product boundaries](../README.md#product-boundaries) and the Playwright suite. |
| One explicit Send publishes multiple eligible conditions atomically | Local verified | [`publish/route.test.ts`](../src/app/api/report/publish/route.test.ts) covers a multi-issue batch; local Postgres checks verified all-or-nothing publication and idempotent retry. The live OpenAI model path is still unverified. |
| Denied GPS offers map selection; explicit pin and named places beat unrelated GPS | Local verified | [`location-resolution.test.ts`](../src/lib/report/location-resolution.test.ts), publish-route cases, and [`location.spec.ts`](../e2e/location.spec.ts) cover fallback and precedence. Actual phone GPS behavior remains unverified. |
| Public reports contain only constrained physical-condition data, never original narratives or photos | Local verified | The publish RPC creates allowlisted titles; public DTOs omit the submitted text, image, browser ID, IP, and undo secret. RLS and local database checks deny direct public writes. |
| Publish and observer actions are rate-limited and idempotent; the browser has no secret key | Local verified | Postgres rate-limit RPCs, batch idempotency, and the server-only store are covered by unit/API and local database checks. [`audit:client-bundles`](../scripts/audit-client-bundles.ts) checks raw configured server-only values against browser build assets; its leak and no-match cases are covered in [`audit-client-bundles.test.ts`](../scripts/audit-client-bundles.test.ts). Hosted credentials and edge limits still need deployment configuration. |
| A second browser receives changes and can recheck without refresh | Implemented; staging unverified | Public Broadcast sends only `{id, version, kind}` and clients refetch canonical data; local trigger and reconnect paths were checked. A two-device/two-network staging session has not run. |
| No false claims of officiality, independent verification, safe routes, or accessibility | Local verified | UI labels observations unverified and routes as candidates; offline prompt contract tests cover source/verification limits. Live model output and a live routing response still need project credentials. |
| Developer can stop writes, hide an unsafe row, and remove demo rows | Documented and locally implemented | `REPORT_WRITES_ENABLED=false`, exact-row SQL hide instructions, and demo-row deletion guidance are in [`reporting-architecture.md`](./reporting-architecture.md) and [`deployment.md`](./deployment.md). Hosted operations have not been changed. |

## Acceptance scenarios

| # | Scenario | Status | Evidence / boundary |
|---:|---|---|---|
| 1 | “Icy ramp here” with fresh GPS produces one approximate unverified report without another question | Locally covered | Publish route mocks, deterministic location policy, and E2E GPS-denial/pin fallback. Live model interpretation and actual GPS remain unverified. |
| 2 | Ice plus a broken streetlight in one Send becomes two records in one batch | Locally covered | Multi-issue route test plus local Postgres transaction check. |
| 3 | A named trusted building overrides unrelated current GPS | Locally covered | Publish-route and pure location-precedence tests. Exact entrances use the trusted place catalog; no unlisted entrance coordinate is invented. |
| 4 | Missing location asks for one location follow-up | Locally covered | [`location-resolution.test.ts`](../src/lib/report/location-resolution.test.ts) and publish-route test verify no silent GPS fallback. |
| 5 | GPS with very poor accuracy requires a pin or named place | Locally covered | Deterministic location policy test; real-device accuracy behavior remains unverified. |
| 6 | Ask mode reads data and never publishes | Locally covered | Assistant route exposes no publish operation; report action is an explicit UI action; prompt contract test checks read-only boundaries. |
| 7 | Allegations about a person never enter the community map | Locally covered | Deterministic screen rejects person/allegation wording before semantic intake; publish-route test verifies no model or database call. This is a conservative text gate, not a guarantee that every harmful input is detected. |
| 8 | Repeating the same publication nonce returns the same receipt | Local verified | The route returns a completed receipt before duplicate search on retry; a route regression test asserts no moderation, model, duplicate, or write call repeats. The atomic RPC idempotency path is also checked against local Postgres. The server HMAC is part of the digest. |
| 9 | Different browser fingerprints add observations labeled unverified | Implemented; multi-device unverified | HMAC observation handling and copy are implemented. Real independent-user claims are intentionally unsupported. |
| 10 | Repeating “Still there” from the same browser is throttled | Local database verified | Observation RPC suppresses recent same-browser/action repeats. |
| 11 | A fabricated broadcast cannot create a public report | Locally covered | Broadcast parser accepts only minimal invalidation fields and the client refetches canonical map state. [`realtime-protocol.test.ts`](../src/lib/report/realtime-protocol.test.ts). |
| 12 | Offline state reconciles on reconnect | Implemented; staging unverified | The client refetches after reconnect, focus/visibility, and on a foreground timer. No network-interruption staging session has been run. |
| 13 | No login, OAuth, moderator queue, or profile is needed to use the demo | Local review passed | No such UI or routes are in the product surface. |
| 14 | Direct insert using the public database role is denied | Local database verified | Local Supabase checks confirmed public roles have no insert/update/delete grants on report and operational tables. Hosted role configuration remains unverified. |
| 15 | Original photos, raw text, and capability secrets are absent from public API/map payloads | Local verified | Photo processing stays in memory; stored fields and DTOs are constrained; undo secrets are returned only to the submitting browser and only their hashes are stored. |
| 16 | Missing actionable issue or vague observation time asks one question before publication | Local verified | Publish-route tests assert follow-up responses happen before duplicate lookup/write, including an empty issue list. Desktop/mobile browser tests verify the time answer is required and retained with the draft for an explicit retry; no publish endpoint reached the real database. |
| 17 | A past time on one issue does not block a separate current issue in the same message | Local verified | Publish-route tests verify current ice and explicitly dated light reports proceed together without a spurious follow-up, and that a model-marked unknown time targets its own issue index. |

## External verification still required

- Run the live GPT-6 Luna prompt evaluation from [`prompt-evaluation.md`](./prompt-evaluation.md) using the intended OpenAI project. The current local environment has no `OPENAI_API_KEY` or `OPENAI_REPORT_MODEL`; no live prompt request has been made.
- Configure an OpenRouteService key and verify its live walking response. Without it, the map correctly shows a provider-unavailable state and does not fabricate a route.
- Verify GPS and keyboard behavior on actual phones, then run a two-browser session on separate networks.
- Verify hosted Supabase key roles, production rate limiting, HMAC values, cron schedules, allowed MapTiler referrers, and the write kill switch before enabling writes.
- The currently running local Next server inherits a remote `DATABASE_URL` from `.env.development.local`; its place-search API returned 503. Use an isolated local-DB configuration for further database-backed browser checks, and do not use that server for publish tests.
- Deployment and production data changes require explicit project authorization and are outside local verification.

For current automated and browser-check details, see the [implementation journal](./implementation-journal.md). Update this matrix when an acceptance scenario gains new evidence; do not convert an external requirement to “verified” based on a mock.
