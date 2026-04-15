/*
  # Add pg_cron jobs for GitHub sync

  ## Summary
  Creates two scheduled jobs using pg_cron + pg_net:

  1. **init-sync** — runs every 5 minutes, calls `sync-github-projects-init`.
     Each invocation processes one page (≤30 repos) of one search query and
     saves progress to sync_jobs. The function returns immediately (noop) when
     no active init job exists, so this cron is always safe to leave running.

  2. **weekly-incremental-sync** — runs every Monday at 01:00 UTC, calls
     `sync-github-projects`. Only searches repos created in the past 7 days
     and inserts new ones (skips existing github_ids).

  ## Notes
  1. Both jobs use pg_net to call the deployed Supabase Edge Functions.
  2. Existing cron jobs with the same name are removed before re-creating
     to allow safe re-runs of this migration.
*/

SELECT cron.unschedule('init-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'init-sync'
);

SELECT cron.unschedule('weekly-incremental-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-incremental-sync'
);

SELECT cron.schedule(
  'init-sync',
  '*/5 * * * *',
  $$
  SELECT extensions.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/sync-github-projects-init',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'weekly-incremental-sync',
  '0 1 * * 1',
  $$
  SELECT extensions.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/sync-github-projects',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
