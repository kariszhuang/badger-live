-- Shared, clearly labeled community posts. Demo conditions are examples, not live observations.
create table public.community_updates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','construction','ice','snow','blocked_path','flooding','lighting','accessibility','other')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 3 and 500),
  place_name text not null check (char_length(place_name) between 2 and 120),
  point extensions.geography(Point,4326) not null,
  starts_at timestamptz,
  ends_at timestamptz,
  source_url text,
  is_demo boolean not null default false,
  up_votes integer not null default 0 check (up_votes >= 0),
  down_votes integer not null default 0 check (down_votes >= 0),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index community_updates_point_gix on public.community_updates using gist(point);
create index community_updates_visible_idx on public.community_updates(created_at desc) where hidden_at is null;

create table internal.community_update_votes (
  update_id uuid not null references public.community_updates(id) on delete cascade,
  browser_hmac text not null check (browser_hmac ~ '^[0-9a-f]{64}$'),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (update_id, browser_hmac)
);
alter table public.community_updates enable row level security;
alter table internal.community_update_votes enable row level security;
revoke all on public.community_updates from public, anon, authenticated;
grant select on public.community_updates to anon, authenticated;
create policy community_updates_visible on public.community_updates for select to anon, authenticated using (hidden_at is null);
revoke all on internal.community_update_votes from public, anon, authenticated;

create or replace function public.vote_community_update(p_id uuid, p_browser_hmac text, p_vote smallint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, internal as $$
declare result public.community_updates%rowtype;
begin
  if p_browser_hmac !~ '^[0-9a-f]{64}$' or p_vote not in (-1, 1) then
    raise exception 'invalid vote' using errcode = '22023';
  end if;
  select * into result from public.community_updates where id = p_id and hidden_at is null for update;
  if not found then return jsonb_build_object('found', false); end if;
  insert into internal.community_update_votes(update_id, browser_hmac, vote) values (p_id, p_browser_hmac, p_vote)
    on conflict (update_id, browser_hmac) do update set vote = excluded.vote;
  select count(*) filter (where vote = 1), count(*) filter (where vote = -1)
    into result.up_votes, result.down_votes from internal.community_update_votes where update_id = p_id;
  update public.community_updates set up_votes = result.up_votes, down_votes = result.down_votes,
    hidden_at = case when result.down_votes >= 5 then now() else null end
    where id = p_id returning * into result;
  return jsonb_build_object('found', true, 'upVotes', result.up_votes, 'downVotes', result.down_votes, 'hidden', result.hidden_at is not null);
end;
$$;
revoke all on function public.vote_community_update(uuid,text,smallint) from public, anon, authenticated;
grant execute on function public.vote_community_update(uuid,text,smallint) to service_role;

create or replace function public.broadcast_community_update()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, realtime as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id), 'community_changed', 'campus:community', false);
  return new;
end;
$$;
create trigger community_update_changed after insert or update on public.community_updates
for each row execute function public.broadcast_community_update();
revoke all on function public.broadcast_community_update() from public, anon, authenticated;

insert into public.community_updates(id,kind,title,description,place_name,point,starts_at,ends_at,source_url,is_demo,created_at) values
('6af9a344-4590-42a2-b548-767db39be001','event','Badger BuildFest 2026','24-hour campus hackathon hosted by the Tech Exploration Lab and partners. The event includes building, mentoring, finalist pitches, and awards.','Morgridge Hall',extensions.st_setsrid(extensions.st_makepoint(-89.40679586,43.07283433),4326)::extensions.geography,'2026-09-26 11:00:00-05','2026-09-27 16:00:00-05','https://badger-build-fest-2026.devpost.com/',false,'2026-09-26 09:00:00-05'),
('6af9a344-4590-42a2-b548-767db39be002','construction','Construction near Science Hall','Demo example: a temporary work zone may narrow the walkway. This has not been reported as a live condition.','Science Hall',extensions.st_setsrid(extensions.st_makepoint(-89.40112083,43.07587034),4326)::extensions.geography,null,null,null,true,now()),
('6af9a344-4590-42a2-b548-767db39be003','ice','Icy patch by Van Vleck','Demo example only: illustrates how a slippery-surface report appears. No current ice has been verified here.','Van Vleck Hall',extensions.st_setsrid(extensions.st_makepoint(-89.40493702,43.07480652),4326)::extensions.geography,null,null,null,true,now()),
('6af9a344-4590-42a2-b548-767db39be004','blocked_path','Blocked route near Union South','Demo example: illustrates a blocked-walkway report. This is not a current campus alert.','Union South',extensions.st_setsrid(extensions.st_makepoint(-89.40807376,43.07185607),4326)::extensions.geography,null,null,null,true,now()),
('6af9a344-4590-42a2-b548-767db39be005','lighting','Dim exterior light near Memorial Union','Demo example: illustrates a lighting concern. This condition has not been verified.','Memorial Union',extensions.st_setsrid(extensions.st_makepoint(-89.39991445,43.07642101),4326)::extensions.geography,null,null,null,true,now()),
('6af9a344-4590-42a2-b548-767db39be006','flooding','Standing water by Morgridge Hall','Demo example: illustrates a standing-water report. This condition has not been verified.','Morgridge Hall',extensions.st_setsrid(extensions.st_makepoint(-89.4069,43.07265),4326)::extensions.geography,null,null,null,true,now());
