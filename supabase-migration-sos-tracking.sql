-- Migration: Add SOS Session Tracking with Contact Acknowledgements
-- Run this in your Supabase SQL Editor

-- Create SOS sessions table to track active emergencies
CREATE TABLE IF NOT EXISTS sos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_location JSONB, -- { lat: number, lng: number }
  last_location_update TIMESTAMPTZ,
  location_update_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create acknowledgements table to track contact responses
CREATE TABLE IF NOT EXISTS sos_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sos_sessions(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('safe', 'on_my_way', 'received', 'other')),
  response_message TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sos_sessions_user_id ON sos_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sos_sessions_group_id ON sos_sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sos_sessions_status ON sos_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sos_acknowledgements_session_id ON sos_acknowledgements(session_id);
CREATE INDEX IF NOT EXISTS idx_sos_acknowledgements_contact_phone ON sos_acknowledgements(contact_phone);

-- Enable RLS (Row Level Security)
ALTER TABLE sos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_acknowledgements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sos_sessions
CREATE POLICY "Users can view their own SOS sessions"
  ON sos_sessions FOR SELECT
  USING (true); -- Allow reading for now (can be restricted later)

CREATE POLICY "Users can create their own SOS sessions"
  ON sos_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own SOS sessions"
  ON sos_sessions FOR UPDATE
  USING (true);

-- RLS Policies for sos_acknowledgements
CREATE POLICY "Anyone can view acknowledgements"
  ON sos_acknowledgements FOR SELECT
  USING (true);

CREATE POLICY "Backend can insert acknowledgements"
  ON sos_acknowledgements FOR INSERT
  WITH CHECK (true);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE sos_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE sos_acknowledgements;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sos_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_sos_session_updated_at ON sos_sessions;
CREATE TRIGGER trigger_sos_session_updated_at
  BEFORE UPDATE ON sos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sos_session_updated_at();

-- Grant permissions (adjust based on your setup)
GRANT ALL ON sos_sessions TO authenticated;
GRANT ALL ON sos_acknowledgements TO authenticated;
GRANT ALL ON sos_sessions TO anon;
GRANT ALL ON sos_acknowledgements TO anon;
