-- Keep newly stale observations visible with an explicit stale label for one
-- day, then remove them from the public read model without deleting history.
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

  delete from internal.api_rate_limit_buckets
  where window_started_at < pg_catalog.now() - interval '2 days';
  delete from internal.report_submissions
  where created_at < pg_catalog.now() - interval '7 days';
  delete from internal.report_capabilities
  where expires_at <= pg_catalog.now();
  delete from internal.report_flags
  where created_at < pg_catalog.now() - interval '90 days';
  return changed;
end;
$$;

revoke all on function public.expire_hazard_reports() from public, anon, authenticated;
grant execute on function public.expire_hazard_reports() to service_role;

-- Keep expiry aligned with the most recent observed condition, even when a
-- trusted server function changes it. A counter-signal gets a short review
-- window; a later still-there observation restores the category TTL.
create or replace function public.enforce_hazard_expiry()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare ttl interval;
begin
  ttl := case new.kind
    when 'ice' then interval '6 hours'
    when 'snow' then interval '12 hours'
    when 'flooding' then interval '8 hours'
    when 'blocked_path' then interval '24 hours'
    when 'accessibility_barrier' then interval '24 hours'
    when 'construction_obstruction' then interval '48 hours'
    when 'fallen_branch' then interval '48 hours'
    when 'broken_light' then interval '30 days'
    else interval '7 days'
  end;
  if new.lifecycle = 'possibly_cleared'
     and (tg_op = 'INSERT' or old.lifecycle is distinct from new.lifecycle) then
    new.expires_at := pg_catalog.now() + interval '24 hours';
  elsif new.lifecycle = 'active' then
    new.expires_at := least(new.expires_at, new.last_observed_at + ttl);
  end if;
  return new;
end;
$$;

drop trigger if exists hazard_expiry_guard on public.hazard_reports;
create trigger hazard_expiry_guard
before insert or update of kind, lifecycle, last_observed_at, expires_at
on public.hazard_reports for each row execute function public.enforce_hazard_expiry();
revoke all on function public.enforce_hazard_expiry() from public, anon, authenticated;

create or replace function public.observe_report(
  p_report_id uuid, p_browser_hmac text, p_observation text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare
  report_row public.hazard_reports%rowtype;
  ttl interval;
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
  ttl := case report_row.kind
    when 'ice' then interval '6 hours'
    when 'snow' then interval '12 hours'
    when 'flooding' then interval '8 hours'
    when 'blocked_path' then interval '24 hours'
    when 'accessibility_barrier' then interval '24 hours'
    when 'construction_obstruction' then interval '48 hours'
    when 'fallen_branch' then interval '48 hours'
    when 'broken_light' then interval '30 days'
    else interval '7 days'
  end;
  update public.hazard_reports r set
    lifecycle = case when p_observation = 'possibly_cleared' then 'possibly_cleared' else 'active' end,
    observation_count = r.observation_count + 1,
    last_observed_at = case when p_observation = 'still_there' then pg_catalog.now() else r.last_observed_at end,
    expires_at = case when p_observation = 'possibly_cleared'
      then pg_catalog.now() + interval '24 hours' else pg_catalog.now() + ttl end,
    version = r.version + 1
  where r.id = p_report_id returning * into report_row;
  return pg_catalog.jsonb_build_object('updated', true, 'id', report_row.id, 'version', report_row.version, 'observationCount', report_row.observation_count, 'lifecycle', report_row.lifecycle);
end;
$$;

revoke all on function public.observe_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.observe_report(uuid, text, text) to service_role;
