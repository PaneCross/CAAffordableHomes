-- 020_pg_cron_schedules.sql
-- Moves the weekly match digest and daily expiry check from GitHub Actions cron to pg_cron.
-- GitHub auto-disables scheduled workflows on public repos after 60 days without a commit
-- (this silently stopped both jobs 2026-10-21 → 2026-11-01). pg_cron has no such rule.
--
-- Prereq: Vault secret named `service_role_key` holding the project's service role key.
--         Add it in the dashboard (Integrations → Vault). Never commit the value.
-- Apply:  supabase db query --linked -f supabase/migrations/020_pg_cron_schedules.sql
--         (remote migration history is empty — all migrations here are applied manually; never `db push`)
-- Schedules are UTC, identical to the former GitHub Actions crons.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'weekly-match-digest',
  '0 14 * * 1',  -- Mondays 14:00 UTC = 6 AM PST / 7 AM PDT
  $job$
  select net.http_post(
    url := 'https://monybdfujogcyseyjgfx.supabase.co/functions/v1/daily-match',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'daily-expiry-check',
  '0 15 * * *',  -- daily 15:00 UTC = 7 AM PST / 8 AM PDT
  $job$
  select net.http_post(
    url := 'https://monybdfujogcyseyjgfx.supabase.co/functions/v1/check-expiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
