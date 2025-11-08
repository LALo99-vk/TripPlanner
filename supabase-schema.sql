-- Supabase Database Schema for TripPlanner
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor → New Query

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (stores user profile data)
-- Note: Firebase Auth handles authentication, this stores additional profile data
-- IMPORTANT: Firebase Auth UIDs are strings (not UUIDs), so we use TEXT for the id
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Firebase Auth UID (string format, not UUID)
  email TEXT,
  display_name TEXT,
  photo_url TEXT,
  bio TEXT DEFAULT '',
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  trips_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans table (stores user trip plans)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- References Firebase Auth UID
  name TEXT NOT NULL,
  plan_data JSONB NOT NULL, -- Stores the full AiTripPlanData object
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User metadata table (for quick access to latest plan, etc.)
CREATE TABLE IF NOT EXISTS user_metadata (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- References Firebase Auth UID
  latest_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts table (for social features like Discover page)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- References Firebase Auth UID
  trip_id UUID, -- Optional reference to trip
  media_urls TEXT[] DEFAULT '{}',
  caption TEXT,
  location TEXT,
  tags TEXT[], -- Array of tags
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Row Level Security (RLS) Policies
-- NOTE: Since we're using Firebase Auth (not Supabase Auth), RLS policies
-- that use auth.uid() won't work directly. We have two options:
-- 1. Use service role key (less secure, but works immediately)
-- 2. Configure Supabase to verify Firebase tokens (recommended, requires setup)

-- For now, we'll use a workaround: disable RLS and handle auth in application code
-- OR use service role key for authenticated operations
-- TODO: Set up Firebase token verification in Supabase for proper RLS

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- TEMPORARY: Allow all operations for authenticated users (using service role key)
-- This is a workaround until Firebase token verification is configured
-- In production, you should configure Supabase to verify Firebase tokens

-- Users: Allow all operations (RLS will be enforced via service role key usage)
CREATE POLICY "Allow authenticated user operations on users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

-- Plans: Allow all operations (RLS enforced in app code via user_id checks)
CREATE POLICY "Allow authenticated user operations on plans"
  ON plans FOR ALL
  USING (true)
  WITH CHECK (true);

-- User metadata: Allow all operations
CREATE POLICY "Allow authenticated user operations on user_metadata"
  ON user_metadata FOR ALL
  USING (true)
  WITH CHECK (true);

-- Posts: Allow viewing all, but modifications require auth (enforced in app)
CREATE POLICY "Allow viewing all posts"
  ON posts FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated user operations on posts"
  ON posts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

