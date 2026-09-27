-- Keep an accepted report's original text/photo private for the same seven-day
-- window as its idempotency receipt. The parent cleanup cascades this row.
create table internal.report_private_inputs (
  batch_id uuid primary key references internal.report_submissions(batch_id) on delete cascade,
  original_text text not null check (char_length(original_text) between 1 and 2000),
  photo_data_url text check (photo_data_url is null or char_length(photo_data_url) <= 3000000),
  created_at timestamptz not null default now()
);

alter table internal.report_private_inputs enable row level security;
revoke all on table internal.report_private_inputs from public, anon, authenticated, service_role;
