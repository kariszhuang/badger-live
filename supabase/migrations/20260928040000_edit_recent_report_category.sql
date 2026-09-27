-- Let the submitting browser correct a freshly posted safe category without
-- retaining or resending the original report narrative or private photo.
create or replace function public.edit_hazard_report_category(
  p_report_id uuid,
  p_secret_sha256 text,
  p_kind text,
  p_expected_version integer
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare
  report_row public.hazard_reports%rowtype;
  title_value text;
begin
  if p_secret_sha256 !~ '^[0-9a-f]{64}$'
    or p_kind not in (
      'ice', 'snow', 'flooding', 'blocked_path', 'broken_light',
      'accessibility_barrier', 'construction_obstruction', 'fallen_branch', 'other_physical'
    )
    or p_expected_version not between 1 and 1000000 then
    raise exception 'invalid report edit' using errcode = '22023';
  end if;

  perform 1 from internal.report_capabilities c
  where c.report_id = p_report_id
    and c.secret_sha256 = p_secret_sha256
    and c.expires_at > pg_catalog.now()
  for update;
  if not found then return false; end if;

  select * into report_row from public.hazard_reports r
  where r.id = p_report_id
    and r.lifecycle = 'active'
    and r.observation_count = 1
    and r.version = p_expected_version
    and r.created_at > pg_catalog.now() - interval '30 minutes'
  for update;
  if not found or report_row.kind = p_kind then return false; end if;

  title_value := case p_kind
    when 'ice' then 'Icy surface'
    when 'snow' then 'Snow or ice buildup'
    when 'flooding' then 'Standing water or flooding'
    when 'blocked_path' then 'Blocked walkway'
    when 'broken_light' then 'Broken exterior light'
    when 'accessibility_barrier' then 'Physical access barrier'
    when 'construction_obstruction' then 'Construction obstruction'
    when 'fallen_branch' then 'Fallen branch'
    else 'Physical condition reported'
  end;

  update public.hazard_reports
  set kind = p_kind, public_title = title_value, version = version + 1
  where id = p_report_id and version = p_expected_version;
  return found;
end;
$$;

revoke all on function public.edit_hazard_report_category(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.edit_hazard_report_category(uuid, text, text, integer) to service_role;
