# Community reporting architecture

This note documents the implementation behind the map's community observation layer. It complements the [master plan](Badger_Live_Complete_Master_Plan.md) and should change whenever these boundaries or endpoints change.

## One report, from gesture to map

1. **Explicit intent:** the user opens **Report here** and taps Send. The app requests one GPS reading while the sheet opens; map points and trusted place search are alternatives. Ask Badger cannot write.
2. **Bounded request:** the publish handler checks same-site Origin when present, a 4 MiB streamed request cap, strict Zod input, campus coordinates, GPS age/accuracy, and a server-side kill switch.
3. **Eligibility:** deterministic checks block obvious contact details, emergency requests, and person/crime allegation wording. OpenAI moderation must succeed. The Responses API then returns a strict multi-issue schema; code validates its output, resolves trusted place IDs, derives severity only from exact source text, and rejects observations outside per-kind freshness windows.
4. **Duplicate choice:** PostGIS suggests same-kind reports within 25 metres. The reporter chooses **Same issue** or **Separate issue** when the match is ambiguous. The database locks and revalidates a chosen report before adding its anonymous observation.
5. **Atomic publish:** one server-only `publish_report_batch` RPC creates every eligible report and private undo capability inside a transaction. The request digest and batch ID make an identical retry return the same receipt; changed payload reuse is rejected. The browser shows “posted” only after this RPC succeeds.
6. **Map refresh:** a Postgres trigger broadcasts only `{ id, version, kind }` on public `campus:hazards`. Broadcast is an invalidation hint, not data: every client debounces and fetches the canonical bounded `/api/map/reports` response. The hook also refreshes on reconnect, tab visibility, and a 90-second foreground poll.

## Public data contract

`public.hazard_reports` exposes a fixed title/category, approximate campus point or trusted place, location method and GPS uncertainty, user-reported severity, observation label (`unverified`), count, observation timestamps, expiry, lifecycle, and version. It has no original narrative, raw photo, email/phone, browser ID, IP, undo token, or reviewer field. Public select policies omit hidden/retracted rows. The public Postgres roles have no insert/update/delete grants.

Operational data is under the non-exposed `internal` schema:

- `report_submissions`: HMAC request digest and safe receipt for seven days.
- `report_observations`: HMAC browser key and action history; old entries expire after 90 days.
- `report_capabilities`: SHA-256 hash of a one-time undo token, for at most 30 minutes.
- `report_flags`: hashed inaccurate/outdated/misplaced signals, retained for at most 90 days. Five distinct recent browser HMACs can hide a row automatically.
- `api_rate_limit_buckets`: HMAC keys and counters, cleaned after two days.
- `import_runs`: source/job outcome for operational diagnosis.
- `outbox`: reserved for future server-only retry work; no public listener or user notification is wired to it.

The browser `visitorId` is a random convenience UUID only. The server derives HMACs from it and the edge-provided network address. This reduces accidental repeats and supports rate limits; it cannot prove a person or device is unique, and it is never authorization. Only the unguessable undo capability authorizes a recent retraction.

## Lifecycle and retention

| Category | Freshness window |
|---|---:|
| Ice | 6 hours |
| Flooding | 8 hours |
| Snow | 12 hours |
| Blocked path, physical access barrier | 24 hours |
| Construction obstruction, fallen branch | 48 hours |
| Other physical condition | 7 days |
| Broken exterior light | 30 days |

An accepted observation expires from `last_observed_at` plus its category window. The cron job moves an expired active row to `stale` for a one-day visible period, then to `retracted` (which is no longer in public reads). **Possibly cleared** stays visible as a counter-signal for up to one day. A later **Still there** observation can restore it to active and starts a new category window. Rechecks by the same HMAC/browser and action are suppressed for ten minutes. Anonymous count is a count of accepted browser actions, not unique people or independent confirmation.

## Rate limits and fail-closed behavior

| Action | Network HMAC | Browser HMAC |
|---|---:|---:|
| Publish | 4/hour | 6/day |
| Observe | 20/hour | 6/hour |
| Undo | 10/hour | 5/hour |
| Inaccurate signal | 12/hour | 12/day |
| Report interpretation | 30/hour | 60/day |
| Ask Badger | 20/minute | 80/day |
| Route inspection | 30/hour | 60/day |

Limits are stored atomically in Postgres. Missing database/HMAC keys, unavailable moderation/model service, invalid structured output, RPC failure, stale duplicate selection, or a disabled write switch does not return success or partially publish a batch. A production-facing public endpoint can still be abused; revisit budgets, edge protection, and operations before increasing exposure.

## API map

| Route | Behavior |
|---|---|
| `POST /api/report/publish` | Explicit report gesture; screen, interpret, resolve, deduplicate, atomically publish. |
| `POST /api/report/interpret` | Rate-limited, read-only Ask-mode extraction helper; cannot publish. |
| `POST /api/assistant` | Source-grounded, read-only Q&A over selected date's UW events, campus places, unverified reports, and explicitly requested historical UWPD records. |
| `GET /api/map/reports?bbox=west,south,east,north` | Campus-bounded, max-500 sanitized report DTOs. |
| `GET /api/places/search?q=...` | Search the trusted campus-place catalog. |
| `POST /api/report/:id/observe` | Rate-limited `still_there` or `possibly_cleared` anonymous signal. |
| `POST /api/report/:id/undo` | Recent undo requiring the original one-time token. |
| `POST /api/report/:id/flag` | Rate-limited inaccurate/outdated/misplaced signal. |
| `POST /api/routes/inspect` | Candidate route proximity check; a clear response never guarantees safety/accessibility. |
| `GET /api/cron/expire` | Bearer-protected lifecycle and retention cleanup. |
| `GET /api/cron/import-events` | Bearer-protected official event cache refresh and import-run record. |

## AI prompt work and limits

Report intake is a strict JSON parser with no tools or database access. Its prompt keeps the message, image, place names, and source material untrusted; the server, not the model, chooses coordinates, titles, severity, duplicate outcome, publication, and capability. Ask Badger has a separate read-only system prompt; question/context JSON is sent in the user message, while the system prompt has no write tool or publishing capability. Server code filters any returned source IDs against sources actually loaded.

Prompt contract tests are offline string/contract regressions. They make sure required boundaries stay in source; they are not model-quality measurements. No OpenAI key/model was configured in the inspected environment, so no live GPT-6 Luna trial or adversarial-response measurement is claimed. Configure a verified `OPENAI_REPORT_MODEL` and run manual red-team cases in a disposable/staging project before enabling public writes.

## Manual takedown and rollout

The developer-only kill switch is `REPORT_WRITES_ENABLED=false`. A developer with trusted database access can hide an exact reviewed row with:

```sql
update public.hazard_reports
set lifecycle = 'hidden', version = version + 1, updated_at = now()
where id = '<reviewed-report-uuid>';
```

There is deliberately no moderator UI, report queue, or human-review role in this edition. A public rollout needs an accountable abuse-response process or a more restrictive publishing policy. Do not describe this automated filter as professional moderation.
