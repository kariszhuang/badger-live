create table if not exists public.uw_event_days (
  event_date date primary key,
  events jsonb not null check (jsonb_typeof(events) = 'array'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null default 'uw-official' check (source = 'uw-official')
);

alter table public.uw_event_days enable row level security;
revoke all on table public.uw_event_days from anon, authenticated;
