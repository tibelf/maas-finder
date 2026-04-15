/*
  # Add INSERT policy for sync_jobs table

  Allows authenticated users to insert new sync job records.
  This is required for the "全量初始化" (full init) button to work
  from the browser client.
*/

CREATE POLICY "Authenticated users can insert sync jobs"
  ON public.sync_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
