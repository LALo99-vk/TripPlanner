-- Groups table for Group Travel feature
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor → New Query

-- Groups table (stores group trip information)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  leader_id TEXT NOT NULL, -- Firebase Auth UID
  leader_name TEXT NOT NULL,
  members JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {uid, name, email}
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User groups junction table (stores which groups a user belongs to)
CREATE TABLE IF NOT EXISTS user_groups (
  user_id TEXT NOT NULL, -- Firebase Auth UID
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_groups_leader_id ON groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using service role key workaround for now)
CREATE POLICY "Allow authenticated user operations on groups"
  ON groups FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated user operations on user_groups"
  ON user_groups FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group itinerary activities table
CREATE TABLE IF NOT EXISTS group_itinerary_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  owner_id TEXT NOT NULL, -- Firebase Auth UID
  owner_name TEXT NOT NULL,
  last_edited_by TEXT NOT NULL,
  last_edited_at TIMESTAMPTZ DEFAULT NOW(),
  location JSONB, -- { name, lat, lng }
  order_index INTEGER DEFAULT 0,
  imported_from_user BOOLEAN DEFAULT false,
  source_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for itinerary activities
CREATE INDEX IF NOT EXISTS idx_itinerary_group_id ON group_itinerary_activities(group_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_date ON group_itinerary_activities(date);
CREATE INDEX IF NOT EXISTS idx_itinerary_order ON group_itinerary_activities(group_id, date, order_index);

-- Enable RLS
ALTER TABLE group_itinerary_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Allow authenticated user operations on itinerary"
  ON group_itinerary_activities FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_itinerary_updated_at BEFORE UPDATE ON group_itinerary_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

