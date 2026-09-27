# BADGER LIVE — MASTER BUILD SPECIFICATION
## Hackathon edition: NO login, NO moderator console, AI-first, location-first, realtime

**Version 2.0 · September 27, 2026 · Canonical timezone: America/Chicago · Target: badgerlive.vercel.app**

**This is the single authoritative specification for Codex.** It supersedes earlier drafts that required Supabase Auth, email OTP, moderator dashboards, staff roles, private messaging, or human review queues. **Do not add any of those to the hackathon MVP.** Start by inspecting the actual repository: current screenshots are UX references, not evidence that any backend, API, database, or external integration is already working. Reuse working UI and importers; implement missing pieces in dependency order. All references to `GPT-6 Luna` denote the desired configured model; verify availability in the actual OpenAI project and make the model name an environment variable.

Badger Live is independent, unaffiliated with UW–Madison, and is NOT an emergency service. It does not accept or publish allegations about identifiable people. It never calls an unverified crowd observation a confirmed crime or guaranteed-accessible route.

---

# 0. Decisive scope cuts and safety boundaries

**BUILD:** responsive campus map; authoritative university event calendar and date filters; source-linked official police *historical blotter* if already integrated; clean bottom-sheet AI assistant; explicit **Report here** action; on-demand browser GPS with map-pin fallback; multimodal interpretation where useful; single-message extraction of multiple environmental hazards; deterministic publish policy; normalized Postgres+PostGIS storage; proximity-based duplicate suggestions; observational rechecks; public Supabase Realtime Broadcast; basic source-grounded campus Q&A; polished two-device demo.

**DO NOT BUILD:** registration, sign-in, email verification, phone OTP, Supabase Auth anonymous identity flows, user profiles, role-based permissions, moderator dashboard, moderation queue, private messaging, personal user notifications, sophisticated user reputation, full claims of independent verification, autonomous police dispatch, money handling, direct university maintenance submissions, public photo galleries, or a custom WebSocket server. Lost-and-found messaging and personal-item pictures are Phase 2 and absent from the public MVP.

**Important tradeoff:** Removing authentication and human moderation is reasonable for a tightly scoped hackathon demo, but weakens provenance and abuse prevention. As a result, publish **only ordinary non-identifying physical-condition reports** (ice/snow, blocked sidewalk, broken light, flooding, fallen branch, physically blocked ramp, obvious construction obstruction). Do not publish open-ended accusations, identifiable people, threats, personally identifying narratives, lost-item ownership claims or unreviewed photos. The app must perform automated input screening and rule-based gating, rate-limit all writes, offer a Report inaccurate link, and have a manual database-level takedown switch for the developer. Do not represent that as equivalent to professional moderation. For an open public launch, restore operational abuse-response capacity or tighten publication to structured-only reports.

**User interface language:** `Unverified community observation`, `3 people reported seeing this` (but counts may be spoofed without sign-in), `Last observed 8 minutes ago`, `Possibly cleared`, `Report outdated`. **Do not label a count of anonymous browser actions `independently verified`, `official`, `confirmed crime`, or `verified accessible`.**

# 1. Product behavior and information architecture

## 1.1 Absolute north-star demo

Student A opens phone browser → taps **Report here** → geolocation starts while composer opens → types `Very icy here, wheelchair ramp completely blocked and the streetlight next to it is broken` → presses Send ONCE → AI extracts two distinct environmental observations, associates both with a fresh approximate point, derives affected-ramp severity from explicit wording, checks for potential duplicates, applies automated gates, publishes two safe records atomically, and returns `2 reports posted · Unverified` with two compact native cards. No category, severity, entrance, photograph or extra consent dialog is asked if the explicitly entered **Report** action and complete information are enough. Student B has the map open on a different browser; sees the two markers arrive via a WebSocket broadcast, taps `Still there` for the ice, and A sees the observation counter update live.

A student without location permission can set a single map point or search buildings, and reports must work with approximate locations; never invent exact doors or ramp positions from imprecise GPS.

## 1.2 Layout and visual constraints

MapLibre + MapTiler background is the full-viewport product canvas. On mobile, keep one compact brand/header row, small layer chips (Events · Official info · Community), a floating **Report here** primary button, and smaller **Ask Badger** control. Composer is a bottom sheet at ~45% of viewport, expands on focus/keyboard, and preserves map context. One composer input with microphone as device dictation where available, optional attach-photo affordance (image is analyzed privately but NOT publicly displayed in MVP), a location chip `Current location · ±18 m · Change`, and Send. No onboarding carousel; no account wall; no unrelated feature cards obscuring the map.

Colors: near-white `#FAF9F7`, near-black `#242828`, restrained red `#B5121B`, caution amber `#AD6B19`, official-source blue `#345C8C`; distinct icons/shapes besides color. 44px minimum practical touch targets; 16px form font to avoid mobile zoom; keyboard and screen-reader labels. Start with the user's position on the map only after they explicitly request it. Never continuously share GPS.

Desktop: left search/list rail, map, an assistant right panel or resizable overlay; use shared components and responsive layouts, not separate apps.

## 1.3 Report mode vs general question mode

`Report here` is an explicit write-intent gesture. Ordinary `Ask Badger` is **read-only by default**, even if the user says `I see ice near me` casually. In general chat, the assistant can present a one-click `Post this as a report` native action; clicking it invokes the report pipeline. Location permission does not imply publication consent. Publishing authorization is per explicit reporting gesture, NOT a remembered global Quick Publish permission setting; this is simpler and safer without accounts. If the user sends text from `Report here`, that Send authorizes eligible report publication after server checks.

## 1.4 Native UI responses, not chat essays

Assistant sends typed renderable segments: concise message, issue chips, optional one-question choice row, location selector, existing-duplicate card, published receipt, event card, route warning, and official source link. Collapse verbose rationale behind Details. Show optimistic **Submitting…** only, then show **Posted** after confirmed database commit. Put Edit/Undo on the receipt if capability token is available locally. Do not fabricate success if an API or publish transaction fails.

# 2. Location-first input and intelligent follow-ups

## 2.1 Geolocation behavior

On tapping `Report here`, initiate `navigator.geolocation.getCurrentPosition` (HTTPS + browser permission needed): `{ enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 }`. Open composer immediately while GPS resolves. Freshness target ≤45 seconds at Send; if stale and permitted, reacquire. The browser may remember permission and need not prompt on every report. On refusal, timeout, desktop/no GPS, or poor accuracy, show `Choose on map` and `Search building`; do not disable the report action.

Accuracy heuristics (test on actual phones, not hard promises): ≤25 m use **approximate GPS location** without a blocking question; 25–80 m allow publish with an uncertainty badge unless identity of the exact entrance is essential; >80 m request a map pin or named place. Store the browser-reported `accuracy_m`, `captured_at`, and `location_method`; do not infer exact accessible-entrance coordinates from a broad GPS circle. Show uncertainty visually in the report preview and public details where relevant. No continuous `watchPosition` in MVP.

## 2.2 Location-precedence logic

1. Explicit user-chosen map pin for *this issue*.
2. Unambiguous explicit named entrance, then named building (resolve from trusted place catalog).
3. Location already selected in the app when user clearly references `this entrance/this building`.
4. Fresh GPS for `here`, `where I am`, or an immediate nearby observation in Report mode.
5. Ask one essential question (`Which building?` or map picker) if none can resolve.

If user says `I saw ice yesterday at Van Vleck`, use Van Vleck, not where they are now. If `broken light over there`, request a pin rather than assume device point. A message can contain multiple issues with different named places: parse and validate each independently.

## 2.3 Minimal follow-up policy

A complete report proceeds immediately. An optional photo or extra description is never a prerequisite. Ask one highest-value missing question only if location, event tense, or actionable issue description is genuinely unclear. If the report is already near an existing issue, append a new observational recheck when exact identity is clear; if merging is ambiguous, offer a choice between `Same issue` and `Separate issue` with visual map context. The user can send long natural-language descriptions; don't force category menus before typing.

If a user reports a likely immediate emergency, do not publish it via the ordinary hazards workflow and prominently direct them to 911/verified official channels. Environmental hazards can be reported afterward.

# 3. AI orchestration: GPT-6 Luna as language interface, not database authority

## 3.1 Single semantic-intake call

Use server-side OpenAI Responses API with a strict JSON schema and low output budget. Configure `OPENAI_REPORT_MODEL` (intended GPT-6 Luna if accessible to the project); avoid hard-coding unverified model IDs. Supply: explicit mode (`report`/`ask`), user's text, optional image reference, ephemeral geolocation sample with accuracy/time, selected map place, nearby canonical place IDs and their coordinates, current local time, and candidate nearby hazard summaries. Return ONE typed `IntakePlan` with `intent`, `issues[]`, `resolved_candidate_place_ids`, `observed_at_basis`, `severity_from_user_text`, `missing_critical_fields`, `next_action`, optional `followup`, and brief acknowledgment. `issues[]` is necessary for multi-hazard messages. All uncertain facts stay `null`; NEVER make up coordinates, identity, source URLs, photos, or verification states.

Prefer one AI call for complete reports. Only invoke a second AI call for ambiguous follow-up replies or optional photo enrichment. Deterministic location and duplicate logic belongs in TypeScript/PostGIS. Cache campus place aliases. Cap input length, image bytes, tool calls, per-IP requests and spending; report parsing should not involve a chain of four expensive autonomous agents.

## 3.2 AI tool allowlist

`search_places`, `get_nearby_hazards`, `search_events`, `get_official_records`, and `get_map_context` are read-only. `prepare_report` is a data proposal. The server-side `publish_report` may be invoked ONLY after an explicit Report-mode Send or a confirmed Post action and deterministic safety checks. The model is never given a generic SQL, network, arbitrary tool or service-secret capability; a malicious uploaded photo or official event description is untrusted data, not instructions.

## 3.3 Example extraction

Input: `Ice right here, east sidewalk is completely blocked and lamp is out next to it.` Current GPS fresh, no explicitly named different location.

- Issue 0: ice; approximate GPS; affected sidewalk; user states complete blockage → high *reported* severity; observed now.
- Issue 1: broken light; approximate GPS; beside issue 0; observed now; severity unknown/medium, not asserted safety threat.
- Both eligible for publication after safety/deduplication check. One transaction returns two report IDs. Public titles synthesized with constrained templates, not verbatim unreviewed user narratives.

## 3.4 Campus Q&A

For questions on events, buildings, previously published observations or official blotter information, query normalized data and return source-linked structured cards with original event URL, date/time, organizer and last-fetched timestamp where applicable. Distinguish recent reports from historical records. Read-only chat never mutates database. Never generalize `no reports` to `safe` or `wheelchair accessible`.

# 4. No-login identity strategy and its honest limits

Do not enable Supabase Auth or create users, OTP, login or personal profiles. In the browser, create a cryptographically random `visitor_id` (UUID) stored in localStorage as a **convenience device identifier**; it is NOT trustworthy identity and must NEVER provide privileged authorization. A private server-generated HMAC of this identifier may suppress accidental duplicate rechecks from the same browser. Rate-limit by network metadata/IP at the server, not solely visitor ID. Users can clear storage or open another browser, so do NOT claim `verified independent users`. Display `Community observations: N` with a clear `Unverified` badge. In the two-phone demo, show two devices contributing different observations, not authenticated unique students.

At publish time return an unpredictable one-time secret capability to the same browser, persisted locally with a TTL, for `Undo my recent report` or `Edit my report`; store only its hash in a private DB table. A client-supplied UUID or visitor_id alone never authorizes deletion. If the browser loses the secret, Undo is unavailable. Disable long-lived editing and any cross-device private-history features for this edition.

All public writes run through Next.js server handlers with validation, rate limiting, automated screening, location bounds and dedicated server-side database credentials. The browser gets only a Supabase publishable key for **read-only/public Realtime**. Enable RLS on every exposed public table, grant SELECT only on safe projection tables, and do not expose sensitive operational tables through the Data API. Supabase explicitly warns not to expose secret keys in browser bundles. See: https://supabase.com/docs/guides/getting-started/api-keys .

# 5. No moderator: the smallest defensible public-content policy

No moderator dashboard, appeal UI or review queue. This does **not** mean no safety controls. In the hackathon edition:

1. Restrict report categories to non-accusatory visible **physical** hazards. Disallow crime allegations, identifiable-person reports, stalking, medical information, lost-item ownership claims and emergency dispatch requests from automatic publication. Offer verified official reporting links instead.
2. Classify the user text through the OpenAI Moderation endpoint (e.g. `omni-moderation-latest`) and deterministic rules for phone/email patterns, personal names in allegations, and private-address cues. Moderation models are imperfect: treat uncertain/high-risk cases as **not publicly posted** and tell the user why in neutral language. Do not promise all harmful content is detected.
3. Only publish constrained, generated public titles/descriptions from allowlisted issue categories, place labels and non-identifying physical attributes. For MVP, keep original user narrative out of public map fields and avoid public free-text comments entirely. Raw input is processed transiently; if retained for troubleshooting, encrypt and aggressively expire it, or do not store it at all.
4. Accept optional photographs for *private AI interpretation* only in the first release; public photo display is deferred. Do not display raw faces, plates or IDs via image galleries; remove EXIF when building any future public derivative.
5. Add rate limits and payload/length/area constraints, optional challenge on suspicious traffic, `Report inaccurate` flag that sends a private signal, automatic expiry and a developer-only **kill switch** (`REPORT_WRITES_ENABLED=false`) or manual database takedown. A real open-campus rollout requires an abuse-response contact or a more restrictive content policy; a demo can be limited to seeded data and controlled public writes.
6. Never call a student observation official; never promote observations into police incidents based on counts. Official information remains imported source-linked read-only data.

OpenAI Moderation docs: https://developers.openai.com/api/docs/guides/moderation . Cloudflare Turnstile, if needed: server-side Siteverify is mandatory; the widget alone offers no protection (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

# 6. Database — minimum normalized schema and access rules

Use Supabase Postgres + PostGIS. Keep **public-safe map tables** separate from **server-only operational tables**. Avoid user-profile/roles/Auth dependencies. Database objects and constraints below are a conceptual contract; a practical executable starter migration is in Appendix A. Run it on a throwaway project first and inspect existing extensions/schemas before applying to an existing Supabase project.

| Table | Exposure | Purpose |
|---|---|---|
| `public.campus_places` | SELECT to guests | Canonical buildings, aliases, trusted coordinates, source URLs, optional entrances. |
| `public.hazard_reports` | SELECT to guests | Sanitized map-visible issue, geography, location precision, category, reported severity, lifecycle, approximate observation count, last-observed time. NO raw text, IP, visitor identifier, photo URL or undo token. |
| `public.official_events` | SELECT to guests | Events imported from official calendar with source ID, times, place and last-fetched time. |
| `public.official_records` | SELECT to guests | Official public records when legitimately available with published timestamp and original URL. No implication of a live police feed. |
| `internal.report_submissions` | Server only | Batch idempotency, request identity, commit receipt; does not identify a real person. |
| `internal.report_observations` | Server only | Claims/rechecks, server-side visitor HMAC, observed time; counts are never authenticated-independent. |
| `internal.report_capabilities` | Server only | Hash of unpredictable secret authorizing limited undo. |
| `internal.report_flags` | Server only | Report inaccurate signals, for automated hide threshold/developer inspection. |
| `internal.import_runs` | Server only | External source fetch status, failures, freshness. |
| `internal.outbox` | Server only | Retryable notifications and post-commit enrichment if later needed. |

On `hazard_reports`, use geography(Point,4326) with GiST index for near-neighbor searches, plus category/lifecycle and updated_at indexes. For a construction *segment*, support optional GeoJSON/line geometry in Phase 2, not false point geometry. Use four orthogonal fields: `reported_severity`, `observation_label` (always community/unverified in no-auth edition), `lifecycle` (active/stale/possibly_cleared/hidden), and `source_kind` (community vs imported official). Avoid a `community_confirmed` boolean in this version.

For each report store `location_method` (`gps`, `pin`, `place`), `location_accuracy_m`, and optional place/entrance foreign key. Do NOT store raw device location history or analytics events containing precise GPS coordinates. `reported_at` is server receipt time; `observed_at` reflects user-described observation time or submission time only when actually contemporaneous.

**Atomic batch publication:** server validates all safe/complete issues, generates `client_submission_id`, optionally saves incomplete items only in browser draft state, and calls one DB RPC transaction for all publishable issues. Add UNIQUE `(client_submission_id, item_index)` to make retries idempotent; the server must ensure identical nonce retries cannot overwrite another submitted payload. If an item is ineligible, return item-specific status, not a misleading `all published`. Update map only after database commit.

**Duplicate search:** category + spatial radius (initially ~25m for point hazards) + recent observation window; prioritize exact building entrance matches, and never merge two distinct entrances just because they share a building. When candidate identity is ambiguous, return `Possible existing issue` card rather than silently merging.

**Recheck flow:** `Still there` produces an observation when a browser has not already checked that report recently; optionally `Possibly cleared` adds a counter-signal. Neither action establishes official resolution or true independent verification. Set issue-specific TTLs (short for ice/flooding, longer for broken lights); mark stale when TTL passes, retain historical evidence if appropriate. Let developer hide a bad row using a server-only SQL command or dashboard without building a moderator product.

# 7. API contracts, routes and real-time semantics

Next.js Route Handlers (Node runtime, secrets server-side):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/assistant` | POST | Read-only tool-grounded Q&A, streaming if useful; never implicitly publish. |
| `/api/report/interpret` | POST | AI extract + structured response, optional follow-up, duplicate candidates, provisional draft. |
| `/api/report/publish` | POST | Validates explicit report intent, rate limit, safe category and structured fields; calls atomic RPC. |
| `/api/report/:id/observe` | POST | Adds `still_there` or `possibly_cleared` browser claim, rate limited. |
| `/api/report/:id/undo` | POST | Requires secret capability, revokes recent report, emits broadcast. |
| `/api/report/:id/flag` | POST | Mark inaccurate; limited per network/device, no public allegations. |
| `/api/map/reports?bbox=...` | GET | Sanitized visible reports with bounds and max result cap. |
| `/api/places/search?q=...` | GET | Trusted campus place lookup. |
| `/api/events?...` | GET | Cached official event queries. |
| `/api/routes/inspect` | POST | Intersect supplied candidate route with active report geography; never guarantee safety. |
| `/api/cron/import-events` | GET/POST | Cron-secret-protected importer, deduplicated by upstream IDs. |
| `/api/cron/expire` | GET/POST | Cron-secret-protected stale-lifecycle housekeeping. |

Server request guards: origin checks are supplemental only (not auth); network/IP + visitor HMAC rate limits in persistent store (Upstash Redis or Vercel abuse controls), optional Turnstile Siteverify, hard maximum body size, bounded geographic area and sanitized DTOs. Limit expensive model calls separately from publish attempts. A public write endpoint can still be abused despite automated filtering: for public hackathon demo, use restrictive request budgets and be prepared to switch into read-only mode.

## 7.1 Supabase Broadcast WITHOUT authentication

Use a **public** `campus:hazards` Broadcast topic. Supabase documents `realtime.send(payload,event,topic,false)` for public subscriptions that do not require sign-in. A DB trigger or trusted server sender emits only `{ id, version, kind }` after committed changes. Clients subscribe over the SDK's WebSocket, then refetch sanitized canonical state. Never treat a received broadcast as authoritative; public channels may also accept untrusted client-originated events, so validate event payload, rate-limit/debounce refetch and reject updates not backed by DB API state. A public topic must never contain private names, originals, device identifiers or precise hidden GPS.

Connection lifecycle: subscribe, fetch current visible viewport, on `hazard_changed` refetch affected IDs or debounce viewport refresh, reconcile on reconnect/tab visibility, unsubscribe on unmount. For early demo use one campus-wide topic; spatially partition later only if traffic warrants it. Use Supabase Realtime instead of running custom WebSocket servers on Vercel. Docs: https://supabase.com/docs/guides/realtime/broadcast .

## 7.2 Reporter UI receipts

After DB transaction returns, show exact count `2 reports posted`, each marker card and labels `Unverified · Approximate location`; expose `Undo` and `View on map`. On partial rejection: `1 posted, 1 needs a location`; don't lose either issue. On rate limit: report remains a local draft with retry guidance. On ambiguous duplicate: let student tap Same issue or Separate issue with only one extra interaction.

# 8. Official integrations and advanced feature staging

Events: import from https://today.wisc.edu/api-docs/ using published documented endpoints (verify actual endpoint against live docs), retain upstream IDs, event instance dates, original link, fetched time, timezone, location and missing coordinates handling. Show original URL on every imported event. Badger's AI can answer `Any free CS events near Union South tonight?` by querying stored facts, never inventing an organizer/time.

Official safety: if the existing public police blotter is correctly sourced, preserve it in a visually distinct official historical layer. Historical entries ≠ live alert ≠ user claim. Links should open the university's current emergency resources. No public anonymous crime submissions.

Construction, parking and repairs: reuse the *environmental hazard* reporting system for blockages and damaged infrastructure, but full official geometry/parking occupancy are later. Do not invent `live parking` without an actual live official source.

Lost & Found: display official campus lost-and-found office information or static links now. Postpone community ownership claims, private chat, match alerts and photo galleries until you have authentication/privacy/abuse support.

Weather: a freezing forecast may show `Possible recurrence: please recheck` for historical ice-prone sites, NOT a newly confirmed current hazard. Saved-route notifications require an identity/contact/opt-in architecture and are deferred.

Routes: for the hackathon, show candidate walking routes with report intersections and a warning `Reported obstruction on this route`; add trusted routing and verified accessibility metadata later. The absence of reports does not prove accessibility or safety.

# 9. Environment variables and repository structure

Browser-safe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MAPTILER_KEY` (restrict by referrer/domain where service supports it). Server-only: `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `OPENAI_REPORT_MODEL`, `REPORT_FINGERPRINT_HMAC_KEY` (long random), `CRON_SECRET`, `REPORT_WRITES_ENABLED=true`, persistent rate limiter keys, optional `TURNSTILE_SECRET_KEY`. Do not store user passwords, session JWTs or OAuth callbacks; NO authentication UI in this edition.

```text
app/
  page.tsx
  api/
    assistant/route.ts
    report/interpret/route.ts
    report/publish/route.ts
    report/[id]/observe/route.ts
    report/[id]/undo/route.ts
    report/[id]/flag/route.ts
    map/reports/route.ts
    places/search/route.ts
    events/route.ts
    routes/inspect/route.ts
    cron/import-events/route.ts
    cron/expire/route.ts
components/
  map/MapCanvas.tsx
  map/LayerSelector.tsx
  map/HazardLayer.tsx
  report/ReportSheet.tsx
  report/LocationChip.tsx
  report/ReportReceipt.tsx
  assistant/AssistantSheet.tsx
  assistant/FollowupChoice.tsx
  events/EventCard.tsx
lib/
  ai/intake.ts
  ai/structured-schema.ts
  ai/content-gates.ts
  geo/get-current-position.ts
  geo/resolve-location.ts
  geo/nearby.ts
  db/admin-server.ts
  report/publish-policy.ts
  report/idempotency.ts
  report/visitor-fingerprint.ts
  realtime/use-hazard-updates.ts
  rate-limit.ts
  import/uw-events.ts
supabase/migrations/001_hackathon_core.sql
```

# 10. From-zero step-by-step build order

**Step 0 — Audit repository (20–30 min).** `git status`, package manifest, Next version, current map, Supabase connection, real event importer, crime blotter licensing/source links, Vercel env, tests. Create one `feature/reporting` branch. Confirm project deploys before changing anything.

**Step 1 — Provision (30–45 min).** Create/confirm Supabase project; enable PostGIS; run Appendix A in a disposable project; seed a handful of real known campus buildings only after verifying coordinates. Add browser publishable key and server secret; configure OpenAI and MapTiler domain-restricted key. Verify DB roles cannot write from publishable key, and secret does not appear in any client bundle.

**Step 2 — Minimal report UI (45–60 min).** Persist map, add Report here CTA, location chip, bottom sheet text area, small send affordance, map pin selection, GPS denial fallback, exact `Unverified` labels. All UI works with mocked API fixtures first.

**Step 3 — AI interpret (60–90 min).** Strict typed schema, multi-issue extraction, named-location precedence, essential follow-up only, read-only general chat. Add deterministic eligibility gate and tests. Use a model mock for tests and actual configured Luna only in dev/prod.

**Step 4 — Safe server publication (60–90 min).** Rate limiter, HMAC visitor fingerprint, input moderation, constrained public titles, POST publish, transactional RPC, idempotency, undo secret. Prove two issues in one request create exactly two rows and retry creates zero duplicates.

**Step 5 — Map and duplicate handling (45–60 min).** Fetch public DTO by bbox, use GeoJSON Source and symbol/circle layers, candidate detection, stale labeling, details sheet. If already same active exact issue, present/update recheck path rather than duplicate marker.

**Step 6 — Live two-browser experience (45–60 min).** Public Supabase Broadcast; trigger or server broadcast after commit; subscribe/refetch/reconcile; `Still there` from second browser; verify correct count and `Unverified` badge on both screens. No login or moderator UI.

**Step 7 — Assistant + event tools (45–60 min).** Search official events and building records, show source-linked event cards and map movement. Only after report vertical slice is reliable.

**Step 8 — Safety and polish (45–60 min).** Try malicious free text, impossible GPS, stale position, denied permission, retries, fake broadcast, burst traffic, XSS attempts, direct publishable-key writes, publication failure, unmounted photo, two reports at adjacent different entrances, narrow screen and keyboard. Turn off public photos and flag unsafe text to `not published`.

**Step 9 — Demo + deploy (60 min).** Two phones on different networks or browser profiles; seed non-deceptively labeled test issue or create clearly illustrative live hazard entries for the demo and delete them afterwards. Screen-record 2 minutes: one Send for two issues → instant two markers → second device observational recheck → both update → relevant AI event answer. README must state unofficial/limited demo and explain unsupported features. Apply actual submission deadline from event organizers, not stale copied instructions.

## 10.1 Definition of done

- No account or moderator step anywhere in the P0 UI or deployed API contract.
- One Send from an explicit Report composer publishes two eligible issues if location and issue facts are supplied.
- Denied GPS offers map pick; named location overrides unrelated current GPS.
- Only safe public physical-condition titles are stored/rendered; no public original photos/raw narratives.
- Publication and observer actions are rate-limited and idempotent; no client uses secret key.
- A second browser sees new reports and rechecks without refresh; reconnect gets canonical state.
- No false claims of officiality, independently verified users, live crime alerts or guaranteed safe route.
- Developer has a read-only kill switch, manual emergency row-hiding ability, and deletion instructions for demo test data.

# 11. Acceptance tests and failure modes

1. `icy ramp here` with fresh permitted GPS → one unverified approximate report, no extra question.
2. `ice and broken streetlight here` → two issue records from one Send, same report batch ID.
3. `ice at east Van Vleck ramp` while GPS near Union South → named trusted place overrides GPS; if entrance not in directory, retain approximate building/side indication rather than invent pin.
4. `ice by that building` with no selection/GPS → one location follow-up.
5. GPS ±200m → choose-pin or named-place path; don't invent entrance.
6. Ask-mode `Is it icy near me?` → lookup only, no publication.
7. User complaint accusing named student of crime → never enters community map or public narrative; provide official reporting options.
8. Same publication nonce resent 3 times → same receipt; no extra rows.
9. Two browser fingerprints posting within a minute → distinct observational rechecks, `Unverified`, with no promise of true person independence.
10. Self repeated `Still there` → throttle/no unlimited counter increments.
11. Public Realtime fabricated broadcast event → client refetches and ignores non-existent/unmodified database state.
12. One phone offline during publish → stale UI corrected on reconnect.
13. No login UI, OAuth redirect, moderator queue or user profile route required to complete whole demo.
14. Direct client insert using publishable key → denied; server-only approved report route succeeds.
15. Original images, raw inputs and capability secrets absent from public API / browser map payload.

# 12. Phase 2 after hackathon (deliberately not MVP)

If invited to open campus-scale reporting, establish a transparent reporting/takedown process and serious abuse policy before enabling unrestricted public photos or free text. Optional verified identity can later support stronger independent-confirmation claims, private lost-and-found messaging, owner claim proofs, saved preferences and push notifications. Add a human safety-response process **only when the product's public submission scope justifies it**; do not let future complexity block this demo. Construction geometry, official parking feeds, route accessibility audits and weather-aware rechecks can share the same normalized geospatial core.

---

# APPENDIX A — Executable starter SQL, Supabase Postgres/PostGIS

This SQL deliberately has NO `auth.users` foreign keys, staff tables or human moderation state. Execute in a **disposable** Supabase project before production. Confirm PostGIS is installed in the `extensions` schema; if it is already installed elsewhere, adjust qualifiers. For first demo deploy, keep official event imports through the Next server. Operational tables live under `internal`, outside Supabase's default exposed schemas.

```sql
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists internal;

create type public.hazard_kind as enum
  ('ice','snow','flooding','blocked_path','broken_light','accessibility_barrier','construction_obstruction','fallen_branch','other_physical');
create type public.hazard_severity as enum ('unknown','low','medium','high');
create type public.hazard_lifecycle as enum ('active','stale','possibly_cleared','hidden','retracted');
create type public.hazard_location_method as enum ('gps','pin','place');

create table public.campus_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  kind text not null default 'building',
  point extensions.geography(Point,4326),
  official_source_url text,
  created_at timestamptz not null default now()
);
create index campus_places_point_gix on public.campus_places using gist(point);

create table public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  batch_item integer not null check (batch_item between 0 and 7),
  kind public.hazard_kind not null,
  public_title text not null check (char_length(public_title) between 3 and 160),
  public_summary text not null default '' check (char_length(public_summary) <= 300),
  point extensions.geography(Point,4326) not null,
  place_id uuid references public.campus_places(id) on delete set null,
  location_method public.hazard_location_method not null,
  location_accuracy_m integer check (location_accuracy_m is null or location_accuracy_m between 0 and 5000),
  severity public.hazard_severity not null default 'unknown',
  lifecycle public.hazard_lifecycle not null default 'active',
  observation_count integer not null default 1 check (observation_count >= 1),
  observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  expires_at timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id,batch_item)
);
create index hazards_point_gix on public.hazard_reports using gist(point);
create index hazards_live_idx on public.hazard_reports(kind,lifecycle,updated_at desc);

create table internal.report_submissions (
  batch_id uuid primary key,
  request_digest text not null,
  created_at timestamptz not null default now(),
  response_json jsonb,
  -- no verified user identity stored
  check (char_length(request_digest) >= 32)
);
create table internal.report_observations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.hazard_reports(id) on delete cascade,
  browser_hmac text not null,
  observation text not null check (observation in ('original','still_there','possibly_cleared')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index report_obs_lookup_idx on internal.report_observations(report_id,created_at desc);
create unique index report_obs_one_browser_recheck_idx
  on internal.report_observations(report_id,browser_hmac,observation)
  where observation='still_there';

create table internal.report_capabilities (
  report_id uuid primary key references public.hazard_reports(id) on delete cascade,
  undo_secret_sha256 text not null,
  expires_at timestamptz not null
);
create table internal.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.hazard_reports(id) on delete cascade,
  browser_hmac text not null,
  reason text not null check (reason in ('inaccurate','outdated','misplaced')),
  created_at timestamptz not null default now(),
  unique(report_id,browser_hmac,reason)
);
create table public.official_events (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_event_id text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  place_id uuid references public.campus_places(id) on delete set null,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  unique(source_name,source_event_id,starts_at)
);
create index events_date_idx on public.official_events(starts_at,place_id);

-- Default deny: no public write permission to any operational table.
alter table public.campus_places enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.official_events enable row level security;
alter table internal.report_submissions enable row level security;
alter table internal.report_observations enable row level security;
alter table internal.report_capabilities enable row level security;
alter table internal.report_flags enable row level security;

revoke all on public.campus_places,public.hazard_reports,public.official_events from anon,authenticated;
grant select on public.campus_places,public.hazard_reports,public.official_events to anon,authenticated;
create policy guest_read_places on public.campus_places for select to anon,authenticated using (true);
create policy guest_read_hazards on public.hazard_reports for select to anon,authenticated
  using (lifecycle in ('active','stale','possibly_cleared'));
create policy guest_read_events on public.official_events for select to anon,authenticated using (true);

-- Explicitly no read/write grants on internal operational tables.
revoke all on schema internal from public,anon,authenticated;
revoke all on all tables in schema internal from public,anon,authenticated;

-- Query in trusted server with secret key only; adjust function schema exposure
-- to your PostgREST config or use a single explicit SECURITY DEFINER RPC.
create or replace function public.nearby_public_hazards(
  lat double precision, lon double precision, radius_m double precision default 25
) returns setof public.hazard_reports language sql stable security invoker as $$
 select r from public.hazard_reports r
 where r.lifecycle='active' and radius_m between 1 and 200
 and extensions.ST_DWithin(r.point,
   extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326)::extensions.geography,
   radius_m)
 order by r.last_observed_at desc limit 30;
$$;
revoke all on function public.nearby_public_hazards(double precision,double precision,double precision) from public;
grant execute on function public.nearby_public_hazards(double precision,double precision,double precision) to anon,authenticated;

-- Public Broadcast: DB trigger emits invalidation notice only for safe public rows.
create or replace function public.broadcast_hazard_invalidation()
returns trigger language plpgsql security definer set search_path = public, realtime as $$
begin
 perform realtime.send(
   jsonb_build_object('id',new.id,'version',new.version,'kind',new.kind),
   'hazard_changed',
   'campus:hazards',
   false
 );
 return new;
end; $$;
create trigger publish_hazard_invalidation after insert or update on public.hazard_reports
for each row execute function public.broadcast_hazard_invalidation();
revoke all on function public.broadcast_hazard_invalidation() from public,anon,authenticated;

-- Developer emergency hiding (run manually in Supabase SQL Editor; no moderator UI):
-- update public.hazard_reports set lifecycle='hidden',version=version+1,updated_at=now() where id='<validated-uuid>';
```

**Important transaction implementation note:** The migration is the storage and access-control foundation, not a complete publish RPC. Implement `public.publish_report_batch(...)` as a **server-only, SECURITY DEFINER PL/pgSQL** routine with an explicit `SET search_path`, strict item JSON validation, admission of only server-normalized titles, bounded maximum batch length, location range checks, insertion of `internal.report_submissions`, public reports, internal initial observations and undo capability hashes in *one transaction*. Revoke EXECUTE from PUBLIC/anon/authenticated and grant only to service_role. Do not attempt a series of independent Supabase REST inserts and label it atomic. Implement `observe_report` and `undo_report` similarly server-only and keep hashes/capabilities out of public schemas. Validate against a disposable Supabase project and integration-test permissions/trigger before launch; this text is not a statement that the migration has been deployed successfully.

# APPENDIX B — Browser geolocation, no continuous tracking

```typescript
export type ReportLocation = {
  lat: number;
  lon: number;
  accuracyM: number;
  capturedAt: number;
  source: 'gps';
};

export function acquireReportLocation(): Promise<ReportLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('UNAVAILABLE'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({
        lat: coords.latitude,
        lon: coords.longitude,
        accuracyM: coords.accuracy,
        capturedAt: timestamp,
        source: 'gps',
      }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    );
  });
}

export function requiresFreshLocation(loc: ReportLocation, now = Date.now()) {
  return !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)
    || !Number.isFinite(loc.accuracyM)
    || now - loc.capturedAt > 45_000;
}
```

# APPENDIX C — External primary references, to recheck during integration

- Supabase Broadcast (public subscription vs private): https://supabase.com/docs/guides/realtime/broadcast
- Supabase security / RLS: https://supabase.com/docs/guides/database/secure-data
- Supabase keys (publishable vs secret): https://supabase.com/docs/guides/getting-started/api-keys
- Supabase PostGIS: https://supabase.com/docs/guides/database/extensions/postgis
- OpenAI Moderation: https://developers.openai.com/api/docs/guides/moderation
- OpenAI structured outputs / tool calling: https://developers.openai.com/api/docs/guides/structured-outputs
- Browser geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- Official UW events API: https://today.wisc.edu/api-docs/
- University campus map: https://www.map.wisc.edu/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

**Final scope instruction for Codex:** Build the fast, delightful, location-first two-phone reporting demonstration. Resist adding auth, a moderator panel, public photo galleries, account-based verification or speculative features until the stated no-login vertical slice passes on actual devices.
