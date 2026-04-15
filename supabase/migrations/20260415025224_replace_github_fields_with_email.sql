/*
  # Replace GitHub OAuth fields with email in project_claims

  ## Summary
  Removes GitHub-specific columns from project_claims and replaces them with
  a user_email column to support email/password authentication.

  ## Changes
  - project_claims table:
    - Remove: github_username (text)
    - Remove: github_avatar_url (text)
    - Add: user_email (text, not null default '')

  ## Notes
  - Existing claim data is cleared since it was created under GitHub OAuth identities
    which are no longer valid after switching to email/password auth
*/

DELETE FROM project_claims;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_claims' AND column_name = 'github_username'
  ) THEN
    ALTER TABLE project_claims DROP COLUMN github_username;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_claims' AND column_name = 'github_avatar_url'
  ) THEN
    ALTER TABLE project_claims DROP COLUMN github_avatar_url;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_claims' AND column_name = 'user_email'
  ) THEN
    ALTER TABLE project_claims ADD COLUMN user_email text NOT NULL DEFAULT '';
  END IF;
END $$;
