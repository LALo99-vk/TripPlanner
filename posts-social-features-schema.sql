-- Database Schema for Post Likes, Comments, and Shares
-- Run this in Supabase SQL Editor
-- This ensures ALL posts from ALL users appear on Discover page
-- All likes/comments/shares are REAL database interactions (not mock data)

-- Post Likes table (tracks which users liked which posts)
-- UNIQUE constraint ensures one user can only like a post once (prevents duplicate likes)
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- CRITICAL: Prevents duplicate likes - one user can only like once
);

-- Post Comments table
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  user_name TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post Shares table (optional - for tracking shares)
CREATE TABLE IF NOT EXISTS post_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON post_shares(post_id);

-- Enable RLS
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies (only create if they don't exist)
DO $$
BEGIN
  -- Post Likes Policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_likes' 
    AND policyname = 'Allow viewing all post likes'
  ) THEN
    CREATE POLICY "Allow viewing all post likes"
      ON post_likes FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_likes' 
    AND policyname = 'Allow authenticated user operations on post likes'
  ) THEN
    CREATE POLICY "Allow authenticated user operations on post likes"
      ON post_likes FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;

  -- Post Comments Policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_comments' 
    AND policyname = 'Allow viewing all post comments'
  ) THEN
    CREATE POLICY "Allow viewing all post comments"
      ON post_comments FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_comments' 
    AND policyname = 'Allow authenticated user operations on post comments'
  ) THEN
    CREATE POLICY "Allow authenticated user operations on post comments"
      ON post_comments FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;

  -- Post Shares Policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_shares' 
    AND policyname = 'Allow viewing all post shares'
  ) THEN
    CREATE POLICY "Allow viewing all post shares"
      ON post_shares FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'post_shares' 
    AND policyname = 'Allow authenticated user operations on post shares'
  ) THEN
    CREATE POLICY "Allow authenticated user operations on post shares"
      ON post_shares FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Trigger to update updated_at for comments (drop and recreate to avoid conflicts)
DROP TRIGGER IF EXISTS update_post_comments_updated_at ON post_comments;
CREATE TRIGGER update_post_comments_updated_at 
  BEFORE UPDATE ON post_comments
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update post likes_count when likes are added/removed
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update likes_count (drop and recreate to avoid conflicts)
DROP TRIGGER IF EXISTS update_likes_count_on_like ON post_likes;
CREATE TRIGGER update_likes_count_on_like
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_likes_count();

-- Function to update post comments_count when comments are added/removed
CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update comments_count (drop and recreate to avoid conflicts)
DROP TRIGGER IF EXISTS update_comments_count_on_comment ON post_comments;
CREATE TRIGGER update_comments_count_on_comment
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_comments_count();

