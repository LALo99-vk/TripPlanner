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

-- Group chat messages table
CREATE TABLE IF NOT EXISTS group_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, -- Firebase Auth UID
  sender_name TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice')),
  text TEXT, -- For text messages
  voice_url TEXT, -- URL to voice message audio file
  voice_duration INTEGER, -- Duration in milliseconds
  mentions TEXT[], -- Array of mentioned user IDs
  edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat messages
CREATE INDEX IF NOT EXISTS idx_chat_group_id ON group_chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON group_chat_messages(group_id, created_at DESC);

-- Enable RLS
ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Allow authenticated user operations on chat"
  ON group_chat_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_chat_updated_at BEFORE UPDATE ON group_chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group decision center: polls
CREATE TABLE IF NOT EXISTS group_polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- [{ id: text, text: text, votes: text[] }]
  created_by TEXT NOT NULL, -- Firebase Auth UID
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  type TEXT NOT NULL DEFAULT 'single' CHECK (type IN ('single', 'multiple')),
  ai_summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_group_id ON group_polls(group_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON group_polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_created_at ON group_polls(group_id, created_at DESC);

ALTER TABLE group_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on polls"
  ON group_polls FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_polls_updated_at BEFORE UPDATE ON group_polls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group live coordination: member locations
CREATE TABLE IF NOT EXISTS group_member_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  user_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_group_id ON group_member_locations(group_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON group_member_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_active ON group_member_locations(group_id, is_active) WHERE is_active = true;

ALTER TABLE group_member_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on locations"
  ON group_member_locations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Group meet-up points
CREATE TABLE IF NOT EXISTS group_meetups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  added_by TEXT NOT NULL, -- Firebase Auth UID
  added_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetups_group_id ON group_meetups(group_id);
CREATE INDEX IF NOT EXISTS idx_meetups_created_at ON group_meetups(group_id, created_at DESC);

ALTER TABLE group_meetups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on meetups"
  ON group_meetups FOR ALL
  USING (true)
  WITH CHECK (true);

-- Group emergency alerts
CREATE TABLE IF NOT EXISTS group_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, -- Firebase Auth UID
  sender_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_group_id ON group_alerts(group_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON group_alerts(group_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON group_alerts(group_id, created_at DESC);

ALTER TABLE group_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on alerts"
  ON group_alerts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Group budgets (per-group budget configuration)
CREATE TABLE IF NOT EXISTS group_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  total_budget NUMERIC(14,2) DEFAULT 0,
  category_allocations JSONB, -- Optional: { category: { budgeted: number, color?: string } }
  created_by TEXT NOT NULL, -- Firebase Auth UID of leader
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_budgets_group_id ON group_budgets(group_id);

ALTER TABLE group_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on group_budgets"
  ON group_budgets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_group_budgets_updated_at BEFORE UPDATE ON group_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group expenses (individual expense records)
CREATE TABLE IF NOT EXISTS group_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  paid_by TEXT NOT NULL, -- Display name of payer
  paid_by_id TEXT NOT NULL, -- Firebase Auth UID
  split_between TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_expenses_group_id ON group_expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_group_expenses_date ON group_expenses(group_id, date DESC);

ALTER TABLE group_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaders can edit, members can read"
  ON group_expenses FOR ALL
  USING (
    auth.uid()::TEXT = paid_by_id
    OR auth.uid()::TEXT = ANY(split_between)
  )
  WITH CHECK (
    auth.uid()::TEXT = paid_by_id
    OR auth.uid()::TEXT = ANY(split_between)
  );

-- Allow members to add their own expenses (not just leader)
CREATE POLICY "members can add expenses"
  ON group_expenses FOR INSERT
  WITH CHECK (
    auth.uid()::TEXT = paid_by_id
  );

DROP TRIGGER IF EXISTS update_group_expenses_updated_at ON group_expenses;
CREATE TRIGGER update_group_expenses_updated_at BEFORE UPDATE ON group_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group member financial summary (balances for settlement)
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  user_name TEXT NOT NULL,
  budget_share NUMERIC(14,2) DEFAULT 0, -- Assigned budget share (money brought/contributed)
  total_paid NUMERIC(14,2) DEFAULT 0,
  total_owed NUMERIC(14,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_balance ON group_members(group_id, balance);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read only"
  ON group_members
  FOR SELECT
  USING (
    auth.uid()::TEXT IN (
      SELECT user_id FROM group_members WHERE group_id = group_members.group_id
    )
  );

CREATE POLICY "leaders manage group members"
  ON group_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_group_members_updated_at BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group plan approvals (tracks member votes on itinerary finalization)
CREATE TABLE IF NOT EXISTS group_plan_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Firebase Auth UID
  user_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('agree', 'request_changes')),
  comment TEXT, -- Optional comment/feedback
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_approvals_group_id ON group_plan_approvals(group_id);
CREATE INDEX IF NOT EXISTS idx_plan_approvals_vote ON group_plan_approvals(group_id, vote);

ALTER TABLE group_plan_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on plan approvals"
  ON group_plan_approvals FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_plan_approvals_updated_at BEFORE UPDATE ON group_plan_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Group finalized plans (stores approved plan data for budget sync)
CREATE TABLE IF NOT EXISTS group_finalized_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  plan_id UUID, -- Reference to source plan if imported from user plans
  plan_name TEXT,
  destination TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  total_estimated_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  category_budgets JSONB, -- { category: { budgeted: number, color?: string } }
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'editable' CHECK (status IN ('fixed', 'editable')),
  agreed_members TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of user IDs who agreed
  disagreed_members TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of user IDs who requested changes
  finalized_by TEXT, -- Firebase Auth UID of leader who finalized
  finalized_at TIMESTAMPTZ,
  synced_to_budget BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id) -- One finalized plan per group
);

CREATE INDEX IF NOT EXISTS idx_finalized_plans_group_id ON group_finalized_plans(group_id);
CREATE INDEX IF NOT EXISTS idx_finalized_plans_status ON group_finalized_plans(status);

ALTER TABLE group_finalized_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated user operations on finalized plans"
  ON group_finalized_plans FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_finalized_plans_updated_at BEFORE UPDATE ON group_finalized_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

