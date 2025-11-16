-- Add budget_share column to group_members table
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS budget_share NUMERIC(14,2) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN group_members.budget_share IS 'Assigned budget share (money brought/contributed)';
