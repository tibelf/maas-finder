/*
  # Add pg_cron jobs for GitHub sync (v2 — uses pg_net directly)

  ## Summary
  Replaces the vault-based approach with direct pg_net calls using the
  project's known URL and anon key (safe for internal service-to-service calls
  since the Edge Functions use verify_jwt=false).

  Two jobs:
  1. init-sync       — every 5 minutes, drives full initialization batch-by-batch
  2. weekly-incremental-sync — every Monday 01:00 UTC, adds new projects only

  ## Notes
  1. Drops any previously scheduled jobs with the same names first.
  2. Uses net.http_post from the pg_net extension (already installed).
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'init-sync') THEN
    PERFORM cron.unschedule('init-sync');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-incremental-sync') THEN
    PERFORM cron.unschedule('weekly-incremental-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'init-sync',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmywgqqssqwkpcxwvopg.supabase.co/functions/v1/sync-github-projects-init',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBteXdncXFzc3F3a3BjeHd2b3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjk1MjMsImV4cCI6MjA5MTcwNTUyM30.na5QEfzjjY7G2S8V0tV2s2Y5_nLO8zgyKtysyDOMeSk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'weekly-incremental-sync',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://pmywgqqssqwkpcxwvopg.supabase.co/functions/v1/sync-github-projects',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBteXdncXFzc3F3a3BjeHd2b3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjk1MjMsImV4cCI6MjA5MTcwNTUyM30.na5QEfzjjY7G2S8V0tV2s2Y5_nLO8zgyKtysyDOMeSk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
