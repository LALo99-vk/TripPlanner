-- Database Schema Update for Member Contribution & Personal Expense Log
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor → New Query
-- This adds wallet_balance tracking to group_members table

-- Add wallet_balance column to group_members table
-- This tracks the remaining balance in each member's individual contribution wallet
ALTER TABLE group_members 
ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(14,2) DEFAULT 0;

-- Update existing records: wallet_balance = budget_share initially
-- (will be recalculated when expenses are processed)
UPDATE group_members 
SET wallet_balance = budget_share 
WHERE wallet_balance IS NULL OR wallet_balance = 0;

-- Add index for wallet balance queries
CREATE INDEX IF NOT EXISTS idx_group_members_wallet_balance 
ON group_members(group_id, wallet_balance);

-- Add comment for documentation
COMMENT ON COLUMN group_members.wallet_balance IS 
'Remaining balance in member individual contribution wallet. Calculated as budget_share minus personal expenses (expenses where member is the only one in split_between).';

