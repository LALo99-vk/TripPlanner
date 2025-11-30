-- Database Schema for Post Bookmarks
-- Run this in Supabase SQL Editor
-- This allows users to bookmark posts and view them in their profile

-- Post Bookmarks table (tracks which users bookmarked which posts)
CREATE TABLE IF NOT EXISTS post_bookmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- Prevents duplicate bookmarks - one user can only bookmark once
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_post_id ON post_bookmarks(post_id);
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_user_id ON post_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_created_at ON post_bookmarks(created_at DESC);

-- Enable RLS
ALTER TABLE post_bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for post_bookmarks
-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON post_bookmarks;
DROP POLICY IF EXISTS "Users can bookmark posts" ON post_bookmarks;
DROP POLICY IF EXISTS "Users can unbookmark posts" ON post_bookmarks;

-- Allow users to view their own bookmarks
CREATE POLICY "Users can view their own bookmarks"
  ON post_bookmarks FOR SELECT
  USING (true); -- Allow all authenticated users to view (we'll filter by user_id in queries)

-- Allow users to insert their own bookmarks
CREATE POLICY "Users can bookmark posts"
  ON post_bookmarks FOR INSERT
  WITH CHECK (true); -- Allow all authenticated users to bookmark

-- Allow users to delete their own bookmarks
CREATE POLICY "Users can unbookmark posts"
  ON post_bookmarks FOR DELETE
  USING (true); -- Allow all authenticated users to unbookmark (we'll filter by user_id in queries)

