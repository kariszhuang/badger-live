create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('lighting', 'blocked-access', 'slippery-surface', 'facility-hazard')),
  building_id text not null,
  building_name text not null,
  coordinates jsonb not null check (jsonb_typeof(coordinates) = 'array' and jsonb_array_length(coordinates) = 2),
  observed_window text not null check (observed_window in ('just-now', 'past-hour', 'today', 'yesterday')),
  reporter_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'confirmed', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  reviewed_at timestamptz,
  reviewer_email text,
  check ((status = 'pending' and reviewed_at is null and reviewer_email is null)
    or (status <> 'pending' and reviewed_at is not null and reviewer_email is not null))
);

create index if not exists safety_reports_status_expiry_created_idx
  on public.safety_reports (status, expires_at, created_at desc);
create index if not exists safety_reports_category_building_created_idx
  on public.safety_reports (category, building_id, created_at desc);
create index if not exists safety_reports_reporter_created_idx
  on public.safety_reports (reporter_hash, created_at desc);

create table if not exists public.safety_moderation_events (
  id bigint generated always as identity primary key,
  category text not null check (category in ('lighting', 'blocked-access', 'slippery-surface', 'facility-hazard')),
  building_id text not null,
  action text not null check (action in ('publish-unverified', 'confirm-environmental', 'resolve', 'reject')),
  report_count integer not null check (report_count > 0),
  distinct_reporters integer not null check (distinct_reporters >= 0),
  reviewer_email text not null,
  created_at timestamptz not null default now()
);

alter table public.safety_reports enable row level security;
alter table public.safety_moderation_events enable row level security;
revoke all on table public.safety_reports, public.safety_moderation_events from public, anon, authenticated;
