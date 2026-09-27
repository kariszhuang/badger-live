-- Keep pseudonymous observation history only long enough for short-term
-- repeat suppression and to diagnose recent counter-signals.
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
  delete from internal.report_observations
  where created_at < pg_catalog.now() - interval '90 days';
  delete from internal.report_flags
  where created_at < pg_catalog.now() - interval '90 days';
  return changed;
end;
$$;

revoke all on function public.expire_hazard_reports() from public, anon, authenticated;
grant execute on function public.expire_hazard_reports() to service_role;
