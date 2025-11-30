-- Verification and Setup Script for Posts Feature
-- Run this in Supabase SQL Editor to verify/complete setup

-- Step 1: Check if posts table exists (this will show an error if it doesn't, which is fine)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'posts') THEN
    -- Create posts table if it doesn't exist
    CREATE TABLE posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trip_id UUID,
      media_urls TEXT[] DEFAULT '{}',
      caption TEXT,
      location TEXT,
      tags TEXT[],
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    RAISE NOTICE 'Posts table created successfully';
  ELSE
    RAISE NOTICE 'Posts table already exists';
  END IF;
END $$;

-- Step 2: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Step 3: Enable RLS if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'posts' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on posts table';
  ELSE
    RAISE NOTICE 'RLS already enabled on posts table';
  END IF;
END $$;

-- Step 4: Create policies only if they don't exist
DO $$
BEGIN
  -- Check and create "Allow viewing all posts" policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'posts' 
    AND policyname = 'Allow viewing all posts'
  ) THEN
    CREATE POLICY "Allow viewing all posts"
      ON posts FOR SELECT
      USING (true);
    RAISE NOTICE 'Policy "Allow viewing all posts" created';
  ELSE
    RAISE NOTICE 'Policy "Allow viewing all posts" already exists';
  END IF;

  -- Check and create "Allow authenticated user operations on posts" policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'posts' 
    AND policyname = 'Allow authenticated user operations on posts'
  ) THEN
    CREATE POLICY "Allow authenticated user operations on posts"
      ON posts FOR ALL
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Policy "Allow authenticated user operations on posts" created';
  ELSE
    RAISE NOTICE 'Policy "Allow authenticated user operations on posts" already exists';
  END IF;
END $$;

-- Step 5: Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at 
  BEFORE UPDATE ON posts
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Verification: Show posts table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'posts'
ORDER BY ordinal_position;

-- Verification: Show policies
SELECT 
  policyname, 
  cmd as operation,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'posts';




