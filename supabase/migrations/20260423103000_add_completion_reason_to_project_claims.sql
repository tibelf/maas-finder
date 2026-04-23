ALTER TABLE project_claims
ADD COLUMN IF NOT EXISTS completion_reason text
CHECK (completion_reason IN ('merged', 'closed'));

UPDATE project_claims
SET completion_reason = 'merged'
WHERE status = 'merged' AND completion_reason IS NULL;
