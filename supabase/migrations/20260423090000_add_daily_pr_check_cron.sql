/*
  # Add daily pg_cron job for PR status scan

  ## Summary
  Adds a daily cron job that calls the `check-pr-status` Edge Function once
  per day, so `project_claims.status='pr_submitted'` records can be completed
  automatically after PR lifecycle ends:
  - merged PR => `status='merged'`, `completion_reason='merged'`
  - closed PR => `status='merged'`, `completion_reason='closed'`

  ## Notes
  1. Uses pg_net `net.http_post` (same pattern as existing sync cron jobs).
  2. Unschedules existing job with the same name first for idempotency.
  3. Runs at 02:00 UTC every day.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-check-pr-status') THEN
    PERFORM cron.unschedule('daily-check-pr-status');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-check-pr-status',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmywgqqssqwkpcxwvopg.supabase.co/functions/v1/check-pr-status',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBteXdncXFzc3F3a3BjeHd2b3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjk1MjMsImV4cCI6MjA5MTcwNTUyM30.na5QEfzjjY7G2S8V0tV2s2Y5_nLO8zgyKtysyDOMeSk"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
