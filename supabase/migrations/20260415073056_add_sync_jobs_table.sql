/*
  # Add sync_jobs table for tracking GitHub sync progress

  ## Summary
  Creates a sync_jobs table to track the progress of full initialization and
  incremental sync tasks. This enables pg_cron jobs to pick up where they left
  off across multiple executions, avoiding the Edge Function 150-second timeout.

  ## New Tables
  - `sync_jobs`
    - `id` (uuid, primary key)
    - `job_type` (text) — 'init' for full initialization, 'weekly' for incremental
    - `status` (text) — 'running', 'completed', 'failed'
    - `current_query_index` (int) — which search query we're currently on
    - `current_page` (int) — which page within that query
    - `total_scanned` (int) — how many repos have been scanned
    - `total_inserted` (int) — how many repos were inserted into github_projects
    - `started_at` (timestamptz)
    - `finished_at` (timestamptz, nullable)
    - `error_message` (text, nullable)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Authenticated users can read sync jobs (to show progress in UI)
  - Only service role can insert/update (managed by Edge Functions)

  ## Notes
  1. Only one 'init' job should be running at a time; the UI enforces this.
  2. The pg_cron job checks status before each execution to decide whether to continue.
*/

CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL DEFAULT 'init',
  status text NOT NULL DEFAULT 'running',
  current_query_index integer NOT NULL DEFAULT 0,
  current_page integer NOT NULL DEFAULT 1,
  total_scanned integer NOT NULL DEFAULT 0,
  total_inserted integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sync jobs"
  ON public.sync_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_sync_jobs_status ON public.sync_jobs (status);
CREATE INDEX idx_sync_jobs_job_type ON public.sync_jobs (job_type);
