-- Migration Script: Fix Firebase Auth UID Type Issue
-- Run this in Supabase SQL Editor if you already created tables with UUID type
-- This script converts user IDs from UUID to TEXT to support Firebase Auth UIDs

-- Step 1: Drop existing foreign key constraints
ALTER TABLE IF EXISTS plans DROP CONSTRAINT IF EXISTS plans_user_id_fkey;
ALTER TABLE IF EXISTS user_metadata DROP CONSTRAINT IF EXISTS user_metadata_user_id_fkey;
ALTER TABLE IF EXISTS posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;

-- Step 2: Drop existing indexes
DROP INDEX IF EXISTS idx_plans_user_id;
DROP INDEX IF EXISTS idx_posts_author_id;

-- Step 3: Drop existing tables (if you have no data yet, this is safe)
-- WARNING: This will delete all data! Only run if you haven't stored important data yet.
-- If you have data, you'll need to migrate it first.

-- Option A: If you have NO data yet, drop and recreate:
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS user_metadata CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Then run the updated schema from supabase-schema.sql

-- Option B: If you HAVE data, you need to migrate it:
-- 1. Create new tables with TEXT user_id
-- 2. Copy data from old tables to new tables
-- 3. Drop old tables
-- 4. Rename new tables

-- For now, if you have no data, just run the updated supabase-schema.sql file
-- which uses TEXT for user IDs instead of UUID.

