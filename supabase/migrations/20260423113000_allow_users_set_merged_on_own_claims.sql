/*
  # Allow owners to transition claims to merged via client updates

  ## Why
  The app now updates `project_claims.status` to `merged` when a submitted PR
  is already closed/merged at submit time. Existing RLS policy rejected this
  because it required `status != 'merged'` in `WITH CHECK`.

  ## Change
  Recreate the update policy to keep ownership enforcement while allowing
  owner-driven status transitions that include `merged`.
*/

DROP POLICY IF EXISTS "Users can update own claims" ON project_claims;

CREATE POLICY "Users can update own claims"
  ON project_claims
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
