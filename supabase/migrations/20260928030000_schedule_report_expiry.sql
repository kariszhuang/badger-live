-- Keep short-lived hazard lifecycle transitions timely on any Vercel plan.
-- Vercel Hobby cron jobs are limited to one run per day, so expiry runs inside
-- Supabase Postgres rather than depending on a frequent Vercel invocation.
create extension if not exists pg_cron;

do $schedule$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'badger-live-expire-hazards'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
  perform cron.schedule(
    'badger-live-expire-hazards',
    '*/10 * * * *',
    'select public.expire_hazard_reports();'
  );
end;
$schedule$;
