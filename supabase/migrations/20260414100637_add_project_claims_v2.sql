/*
  # Add project_claims table (idempotent)

  Creates the project_claims table to track the full lifecycle of project contributions:
  claimed -> pr_submitted -> merged
*/

CREATE TABLE IF NOT EXISTS project_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES github_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username text NOT NULL DEFAULT '',
  github_avatar_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'pr_submitted', 'merged')),
  pr_url text,
  pr_number integer,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'project_claims_active_unique'
  ) THEN
    CREATE UNIQUE INDEX project_claims_active_unique
      ON project_claims (project_id)
      WHERE status IN ('claimed', 'pr_submitted');
  END IF;
END $$;

ALTER TABLE project_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_claims' AND policyname = 'Anyone can view project claims') THEN
    CREATE POLICY "Anyone can view project claims"
      ON project_claims FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_claims' AND policyname = 'Authenticated users can claim projects') THEN
    CREATE POLICY "Authenticated users can claim projects"
      ON project_claims FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_claims' AND policyname = 'Users can update own claims') THEN
    CREATE POLICY "Users can update own claims"
      ON project_claims FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id AND status != 'merged');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_claims' AND policyname = 'Users can delete own claims') THEN
    CREATE POLICY "Users can delete own claims"
      ON project_claims FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id AND status = 'claimed');
  END IF;
END $$;
