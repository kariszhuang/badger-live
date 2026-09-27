-- No-login campus hazard reporting. Public tables contain only safe, templated
-- fields; original report text, browser fingerprints, and undo hashes stay in
-- the non-API `internal` schema.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists internal;

create table public.campus_places (
  id uuid primary key default gen_random_uuid(),
  source_place_id text not null unique,
  name text not null check (char_length(name) between 1 and 160),
  aliases text[] not null default '{}',
  kind text not null default 'building' check (kind in ('building', 'entrance', 'campus_area')),
  point extensions.geography(Point,4326) not null,
  official_source_url text not null default 'https://map.wisc.edu/',
  updated_at timestamptz not null default now()
);
create index campus_places_point_gix on public.campus_places using gist(point);
create index campus_places_name_idx on public.campus_places using gin (to_tsvector('simple', name));
create index campus_places_aliases_idx on public.campus_places using gin (aliases);

create table public.hazard_reports (
  id uuid primary key,
  batch_id uuid not null,
  batch_item smallint not null check (batch_item between 0 and 7),
  kind text not null check (kind in (
    'ice', 'snow', 'flooding', 'blocked_path', 'broken_light',
    'accessibility_barrier', 'construction_obstruction', 'fallen_branch', 'other_physical'
  )),
  public_title text not null,
  public_summary text not null default '' check (char_length(public_summary) <= 200),
  point extensions.geography(Point,4326) not null,
  place_id uuid references public.campus_places(id) on delete set null,
  location_method text not null check (location_method in ('gps', 'pin', 'place')),
  location_accuracy_m integer check (location_accuracy_m is null or location_accuracy_m between 0 and 5000),
  reported_severity text not null default 'unknown' check (reported_severity in ('unknown', 'low', 'medium', 'high')),
  observation_label text not null default 'unverified' check (observation_label = 'unverified'),
  lifecycle text not null default 'active' check (lifecycle in ('active', 'stale', 'possibly_cleared', 'hidden', 'retracted')),
  source_kind text not null default 'community' check (source_kind = 'community'),
  observation_count integer not null default 1 check (observation_count >= 1),
  observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  expires_at timestamptz not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, batch_item),
  check (public_title = case kind
    when 'ice' then 'Icy surface'
    when 'snow' then 'Snow or ice buildup'
    when 'flooding' then 'Standing water or flooding'
    when 'blocked_path' then 'Blocked walkway'
    when 'broken_light' then 'Broken exterior light'
    when 'accessibility_barrier' then 'Physical access barrier'
    when 'construction_obstruction' then 'Construction obstruction'
    when 'fallen_branch' then 'Fallen branch'
    else 'Physical condition reported' end),
  check (location_method <> 'place' or place_id is not null)
);
create index hazard_reports_point_gix on public.hazard_reports using gist(point);
create index hazard_reports_live_idx on public.hazard_reports(lifecycle, expires_at, updated_at desc);
create index hazard_reports_kind_idx on public.hazard_reports(kind, lifecycle, last_observed_at desc);
create index hazard_reports_place_idx on public.hazard_reports(place_id, kind, lifecycle);

create table public.official_events (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'uw-today' check (source_name = 'uw-today'),
  source_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null check (char_length(title) between 1 and 240),
  subtitle text,
  description text,
  organizer_url text,
  location_label text not null default 'Location not listed',
  point extensions.geography(Point,4326),
  place_id uuid references public.campus_places(id) on delete set null,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  unique(source_name, source_event_id, starts_at)
);
create index official_events_date_idx on public.official_events(starts_at, source_name);
create index official_events_point_gix on public.official_events using gist(point);

create table public.official_records (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_record_id text not null,
  title text not null check (char_length(title) between 1 and 240),
  published_at timestamptz,
  place_label text,
  place_id uuid references public.campus_places(id) on delete set null,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  unique(source_name, source_record_id)
);
create index official_records_date_idx on public.official_records(published_at desc);

create table internal.report_submissions (
  batch_id uuid primary key,
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  response_json jsonb
);
create table internal.report_observations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.hazard_reports(id) on delete cascade,
  browser_hmac text not null check (browser_hmac ~ '^[0-9a-f]{64}$'),
  observation text not null check (observation in ('original', 'still_there', 'possibly_cleared')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index report_observations_recent_idx on internal.report_observations(report_id, browser_hmac, created_at desc);
create table internal.report_capabilities (
  report_id uuid primary key references public.hazard_reports(id) on delete cascade,
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
create table internal.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.hazard_reports(id) on delete cascade,
  browser_hmac text not null check (browser_hmac ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('inaccurate', 'outdated', 'misplaced')),
  created_at timestamptz not null default now(),
  unique(report_id, browser_hmac, reason)
);
create table internal.api_rate_limit_buckets (
  key_hmac text not null check (key_hmac ~ '^[0-9a-f]{64}$'),
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key(key_hmac, action, window_started_at)
);
create index api_rate_limit_expiry_idx on internal.api_rate_limit_buckets(window_started_at);
create table internal.import_runs (
  id bigint generated always as identity primary key,
  source_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null check (outcome in ('running', 'succeeded', 'failed')),
  details text
);
create table internal.outbox (
  id bigint generated always as identity primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create or replace function internal.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
create trigger touch_hazard_updated_at before update on public.hazard_reports
for each row execute function internal.touch_updated_at();

alter table public.campus_places enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.official_events enable row level security;
alter table public.official_records enable row level security;
revoke all on public.campus_places, public.hazard_reports, public.official_events, public.official_records from public, anon, authenticated;
grant select on public.campus_places, public.hazard_reports, public.official_events, public.official_records to anon, authenticated;
create policy public_read_campus_places on public.campus_places for select to anon, authenticated using (true);
create policy public_read_visible_hazards on public.hazard_reports for select to anon, authenticated
  using (lifecycle in ('active', 'stale', 'possibly_cleared'));
create policy public_read_official_events on public.official_events for select to anon, authenticated using (true);
create policy public_read_official_records on public.official_records for select to anon, authenticated using (true);

alter table internal.report_submissions enable row level security;
alter table internal.report_observations enable row level security;
alter table internal.report_capabilities enable row level security;
alter table internal.report_flags enable row level security;
alter table internal.api_rate_limit_buckets enable row level security;
alter table internal.import_runs enable row level security;
alter table internal.outbox enable row level security;
revoke all on schema internal from public, anon, authenticated;
revoke all on all tables in schema internal from public, anon, authenticated;
revoke all on all sequences in schema internal from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  p_key_hmac text, p_action text, p_limit integer, p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = pg_catalog, internal as $$
declare
  bucket timestamptz;
  hits integer;
begin
  if p_key_hmac !~ '^[0-9a-f]{64}$' or p_action !~ '^[a-z_]{1,40}$'
     or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit request' using errcode = '22023';
  end if;
  bucket := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  insert into internal.api_rate_limit_buckets(key_hmac, action, window_started_at, request_count)
  values (p_key_hmac, p_action, bucket, 1)
  on conflict (key_hmac, action, window_started_at) do update
    set request_count = internal.api_rate_limit_buckets.request_count + 1
  returning request_count into hits;
  return query select hits <= p_limit,
    greatest(1, (extract(epoch from bucket + p_window_seconds * interval '1 second' - pg_catalog.clock_timestamp()))::integer);
end;
$$;

create or replace function public.publish_report_batch(
  p_batch_id uuid,
  p_request_digest text,
  p_browser_hmac text,
  p_items jsonb,
  p_capability_hashes jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, internal, extensions as $$
declare
  existing_digest text;
  existing_response jsonb;
  item jsonb;
  item_count integer;
  item_index integer;
  report_id uuid;
  place_id uuid;
  kind_value text;
  action_value text;
  title_value text;
  longitude double precision;
  latitude double precision;
  accuracy integer;
  severity_value text;
  location_method_value text;
  observed_at_value timestamptz;
  event_kind text;
  expires_at_value timestamptz;
  secret_hash text;
  inserted_count integer := 0;
  result_rows jsonb := '[]'::jsonb;
  result_item jsonb;
  report_row public.hazard_reports%rowtype;
  affected_rows integer;
begin
  if p_request_digest !~ '^[0-9a-f]{64}$' or p_browser_hmac !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 8
     or jsonb_typeof(p_capability_hashes) <> 'array' then
    raise exception 'invalid report batch' using errcode = '22023';
  end if;

  insert into internal.report_submissions(batch_id, request_digest)
  values (p_batch_id, p_request_digest)
  on conflict (batch_id) do nothing;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    select request_digest, response_json into existing_digest, existing_response
    from internal.report_submissions where batch_id = p_batch_id for update;
    if existing_digest <> p_request_digest then
      raise exception 'idempotency key reused with a different request' using errcode = '23505';
    end if;
    if existing_response is null then
      raise exception 'report batch is already being processed' using errcode = '55P03';
    end if;
    return pg_catalog.jsonb_build_object('idempotent', true, 'reports', existing_response -> 'reports');
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    item_index := (item ->> 'item_index')::integer;
    report_id := (item ->> 'report_id')::uuid;
    kind_value := item ->> 'kind';
    action_value := coalesce(item ->> 'action', 'new');
    place_id := nullif(item ->> 'place_id', '')::uuid;
    location_method_value := item ->> 'location_method';
    accuracy := nullif(item ->> 'location_accuracy_m', '')::integer;
    severity_value := coalesce(item ->> 'reported_severity', 'unknown');
    observed_at_value := coalesce(nullif(item ->> 'observed_at', '')::timestamptz, pg_catalog.now());
    longitude := (item ->> 'longitude')::double precision;
    latitude := (item ->> 'latitude')::double precision;

    if item_index not between 0 and 7 or kind_value not in (
      'ice', 'snow', 'flooding', 'blocked_path', 'broken_light',
      'accessibility_barrier', 'construction_obstruction', 'fallen_branch', 'other_physical'
    ) or action_value not in ('new', 'still_there')
      or location_method_value not in ('gps', 'pin', 'place')
      or severity_value not in ('unknown', 'low', 'medium', 'high')
      or longitude not between -89.455 and -89.375
      or latitude not between 43.045 and 43.095
      or observed_at_value < pg_catalog.now() - interval '365 days'
      or observed_at_value > pg_catalog.now() + interval '5 minutes'
      or (location_method_value = 'gps' and (accuracy is null or accuracy > 80))
      or (location_method_value = 'place' and place_id is null)
      or (place_id is not null and not exists (select 1 from public.campus_places p where p.id = place_id)) then
      raise exception 'invalid report item' using errcode = '22023';
    end if;

    title_value := case kind_value
      when 'ice' then 'Icy surface'
      when 'snow' then 'Snow or ice buildup'
      when 'flooding' then 'Standing water or flooding'
      when 'blocked_path' then 'Blocked walkway'
      when 'broken_light' then 'Broken exterior light'
      when 'accessibility_barrier' then 'Physical access barrier'
      when 'construction_obstruction' then 'Construction obstruction'
      when 'fallen_branch' then 'Fallen branch'
      else 'Physical condition reported' end;
    expires_at_value := pg_catalog.now() + case kind_value
      when 'ice' then interval '6 hours'
      when 'snow' then interval '12 hours'
      when 'flooding' then interval '8 hours'
      when 'blocked_path' then interval '24 hours'
      when 'accessibility_barrier' then interval '24 hours'
      when 'construction_obstruction' then interval '48 hours'
      when 'fallen_branch' then interval '48 hours'
      when 'broken_light' then interval '30 days'
      else interval '7 days' end;

    if action_value = 'new' then
      insert into public.hazard_reports(
        id, batch_id, batch_item, kind, public_title, point, place_id,
        location_method, location_accuracy_m, reported_severity, observed_at,
        last_observed_at, expires_at
      ) values (
        report_id, p_batch_id, item_index, kind_value, title_value,
        extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography,
        place_id, location_method_value, accuracy, severity_value, observed_at_value,
        observed_at_value, expires_at_value
      ) returning * into report_row;

      select value ->> 'secret_sha256' into secret_hash
      from pg_catalog.jsonb_array_elements(p_capability_hashes)
      where (value ->> 'item_index')::integer = item_index;
      if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'missing report capability hash' using errcode = '22023';
      end if;
      insert into internal.report_capabilities(report_id, secret_sha256, expires_at)
      values (report_id, secret_hash, pg_catalog.now() + interval '30 minutes');
      insert into internal.report_observations(report_id, browser_hmac, observation, observed_at)
      values (report_id, p_browser_hmac, 'original', observed_at_value);
      inserted_count := inserted_count + 1;
      result_item := pg_catalog.jsonb_build_object(
        'id', report_row.id, 'kind', report_row.kind, 'title', report_row.public_title,
        'longitude', longitude, 'latitude', latitude, 'placeId', report_row.place_id,
        'locationMethod', report_row.location_method, 'locationAccuracyM', report_row.location_accuracy_m,
        'reportedSeverity', report_row.reported_severity, 'lifecycle', report_row.lifecycle,
        'observationCount', report_row.observation_count, 'observedAt', report_row.observed_at,
        'lastObservedAt', report_row.last_observed_at, 'expiresAt', report_row.expires_at,
        'version', report_row.version, 'undoAvailable', true
      );
    else
      select * into report_row from public.hazard_reports r
      where r.id = report_id and r.kind = kind_value
        and r.lifecycle in ('active', 'stale', 'possibly_cleared')
        and r.expires_at > pg_catalog.now()
        and extensions.st_dwithin(r.point,
          extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography, 25)
        and (r.place_id is null or place_id is null or r.place_id = place_id)
      for update;
      if not found then
        raise exception 'recheck candidate is no longer eligible' using errcode = 'P0002';
      end if;
      if exists (
        select 1 from internal.report_observations o
        where o.report_id = report_id and o.browser_hmac = p_browser_hmac
          and o.observation = 'still_there' and o.created_at > pg_catalog.now() - interval '10 minutes'
      ) then
        result_item := pg_catalog.jsonb_build_object(
          'id', report_row.id, 'kind', report_row.kind, 'title', report_row.public_title,
          'longitude', extensions.st_x(report_row.point::extensions.geometry),
          'latitude', extensions.st_y(report_row.point::extensions.geometry), 'placeId', report_row.place_id,
          'locationMethod', report_row.location_method, 'locationAccuracyM', report_row.location_accuracy_m,
          'reportedSeverity', report_row.reported_severity, 'lifecycle', report_row.lifecycle,
          'observationCount', report_row.observation_count, 'observedAt', report_row.observed_at,
          'lastObservedAt', report_row.last_observed_at, 'expiresAt', report_row.expires_at,
          'version', report_row.version, 'undoAvailable', false, 'recheckStatus', 'recently-counted'
        );
      else
        insert into internal.report_observations(report_id, browser_hmac, observation, observed_at)
        values (report_id, p_browser_hmac, 'still_there', observed_at_value);
        update public.hazard_reports r set
          lifecycle = 'active', observation_count = r.observation_count + 1,
          last_observed_at = observed_at_value, expires_at = expires_at_value,
          version = r.version + 1
        where r.id = report_id returning * into report_row;
        result_item := pg_catalog.jsonb_build_object(
          'id', report_row.id, 'kind', report_row.kind, 'title', report_row.public_title,
          'longitude', extensions.st_x(report_row.point::extensions.geometry),
          'latitude', extensions.st_y(report_row.point::extensions.geometry), 'placeId', report_row.place_id,
          'locationMethod', report_row.location_method, 'locationAccuracyM', report_row.location_accuracy_m,
          'reportedSeverity', report_row.reported_severity, 'lifecycle', report_row.lifecycle,
          'observationCount', report_row.observation_count, 'observedAt', report_row.observed_at,
          'lastObservedAt', report_row.last_observed_at, 'expiresAt', report_row.expires_at,
          'version', report_row.version, 'undoAvailable', false, 'recheckStatus', 'counted'
        );
      end if;
    end if;
    result_rows := result_rows || pg_catalog.jsonb_build_array(result_item);
  end loop;

  select pg_catalog.count(*) into item_count from pg_catalog.jsonb_array_elements(p_items);
  if inserted_count = 0 and item_count = 0 then
    raise exception 'empty report batch' using errcode = '22023';
  end if;
  existing_response := pg_catalog.jsonb_build_object('reports', result_rows);
  update internal.report_submissions set response_json = existing_response where batch_id = p_batch_id;
  return pg_catalog.jsonb_build_object('idempotent', false, 'reports', result_rows);
end;
$$;

create or replace function public.observe_report(
  p_report_id uuid, p_browser_hmac text, p_observation text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare
  report_row public.hazard_reports%rowtype;
begin
  if p_browser_hmac !~ '^[0-9a-f]{64}$' or p_observation not in ('still_there', 'possibly_cleared') then
    raise exception 'invalid report observation' using errcode = '22023';
  end if;
  select * into report_row from public.hazard_reports r where r.id = p_report_id
    and r.lifecycle in ('active', 'stale', 'possibly_cleared') and r.expires_at > pg_catalog.now() for update;
  if not found then return pg_catalog.jsonb_build_object('updated', false); end if;
  if exists (
    select 1 from internal.report_observations o where o.report_id = p_report_id
      and o.browser_hmac = p_browser_hmac and o.observation = p_observation
      and o.created_at > pg_catalog.now() - interval '10 minutes'
  ) then
    return pg_catalog.jsonb_build_object('updated', false, 'recentlyCounted', true, 'id', p_report_id, 'version', report_row.version);
  end if;
  insert into internal.report_observations(report_id, browser_hmac, observation)
  values (p_report_id, p_browser_hmac, p_observation);
  update public.hazard_reports r set
    lifecycle = case when p_observation = 'possibly_cleared' then 'possibly_cleared' else 'active' end,
    observation_count = r.observation_count + 1,
    last_observed_at = case when p_observation = 'still_there' then pg_catalog.now() else r.last_observed_at end,
    version = r.version + 1
  where r.id = p_report_id returning * into report_row;
  return pg_catalog.jsonb_build_object('updated', true, 'id', report_row.id, 'version', report_row.version, 'observationCount', report_row.observation_count, 'lifecycle', report_row.lifecycle);
end;
$$;

create or replace function public.undo_report(p_report_id uuid, p_secret_sha256 text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare changed integer;
begin
  if p_secret_sha256 !~ '^[0-9a-f]{64}$' then return false; end if;
  perform 1 from internal.report_capabilities c where c.report_id = p_report_id
    and c.secret_sha256 = p_secret_sha256 and c.expires_at > pg_catalog.now() for update;
  if not found then return false; end if;
  update public.hazard_reports set lifecycle = 'retracted', version = version + 1
  where id = p_report_id and lifecycle in ('active', 'stale', 'possibly_cleared')
    and created_at > pg_catalog.now() - interval '30 minutes';
  get diagnostics changed = row_count;
  delete from internal.report_capabilities where report_id = p_report_id;
  return changed = 1;
end;
$$;

create or replace function public.flag_report(
  p_report_id uuid, p_browser_hmac text, p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare flag_count integer;
declare hidden boolean := false;
begin
  if p_browser_hmac !~ '^[0-9a-f]{64}$' or p_reason not in ('inaccurate', 'outdated', 'misplaced') then
    raise exception 'invalid report flag' using errcode = '22023';
  end if;
  insert into internal.report_flags(report_id, browser_hmac, reason)
  values (p_report_id, p_browser_hmac, p_reason) on conflict do nothing;
  select count(distinct browser_hmac) into flag_count from internal.report_flags
  where report_id = p_report_id and created_at > pg_catalog.now() - interval '24 hours';
  if flag_count >= 5 then
    update public.hazard_reports set lifecycle = 'hidden', version = version + 1
    where id = p_report_id and lifecycle in ('active', 'stale', 'possibly_cleared');
    hidden := found;
  end if;
  return pg_catalog.jsonb_build_object('accepted', true, 'hidden', hidden);
end;
$$;

create or replace function public.expire_hazard_reports()
returns integer language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare changed integer;
begin
  update public.hazard_reports set lifecycle = 'stale', version = version + 1,
    expires_at = pg_catalog.now() + interval '24 hours'
  where lifecycle = 'active' and expires_at <= pg_catalog.now();
  get diagnostics changed = row_count;
  update public.hazard_reports set lifecycle = 'retracted', version = version + 1
  where lifecycle in ('stale', 'possibly_cleared') and expires_at <= pg_catalog.now();
  delete from internal.api_rate_limit_buckets where window_started_at < pg_catalog.now() - interval '2 days';
  delete from internal.report_submissions where created_at < pg_catalog.now() - interval '7 days';
  delete from internal.report_capabilities where expires_at <= pg_catalog.now();
  delete from internal.report_flags where created_at < pg_catalog.now() - interval '90 days';
  return changed;
end;
$$;

create or replace function public.broadcast_hazard_invalidation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, realtime as $$
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object('id', new.id, 'version', new.version, 'kind', new.kind),
    'hazard_changed', 'campus:hazards', false
  );
  return new;
end;
$$;
create trigger broadcast_hazard_changed after insert or update on public.hazard_reports
for each row execute function public.broadcast_hazard_invalidation();

revoke all on function public.consume_public_rate_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.publish_report_batch(uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.observe_report(uuid,text,text) from public, anon, authenticated;
revoke all on function public.undo_report(uuid,text) from public, anon, authenticated;
revoke all on function public.flag_report(uuid,text,text) from public, anon, authenticated;
revoke all on function public.expire_hazard_reports() from public, anon, authenticated;
revoke all on function public.broadcast_hazard_invalidation() from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.publish_report_batch(uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.observe_report(uuid,text,text) to service_role;
grant execute on function public.undo_report(uuid,text) to service_role;
grant execute on function public.flag_report(uuid,text,text) to service_role;
grant execute on function public.expire_hazard_reports() to service_role;

-- Developer takedown command. Run only in the trusted Supabase SQL editor:
-- update public.hazard_reports set lifecycle = 'hidden', version = version + 1
-- where id = '<reviewed-report-uuid>';
