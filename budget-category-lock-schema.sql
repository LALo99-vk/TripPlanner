-- Database Schema Update for Budget Category Lock Feature
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor → New Query
-- This adds locked_categories tracking to group_budgets table

-- Add locked_categories column to group_budgets table
-- This stores an array of category names that are locked (protected from expenses)
ALTER TABLE group_budgets 
ADD COLUMN IF NOT EXISTS locked_categories TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment for documentation
COMMENT ON COLUMN group_budgets.locked_categories IS 
'Array of category names that are locked by the leader. Expenses cannot be added to locked categories until they are unlocked. Only the group leader can lock/unlock categories.';

-- Create index for faster queries (though array operations are already efficient)
CREATE INDEX IF NOT EXISTS idx_group_budgets_locked_categories 
ON group_budgets USING GIN (locked_categories);

