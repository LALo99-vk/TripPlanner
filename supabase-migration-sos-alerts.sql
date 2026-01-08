-- Migration: Add SOS Alert Support to Group Chat Messages
-- This adds fields to support emergency SOS alerts in group chats

-- Add SOS-specific columns to group_chat_messages table
ALTER TABLE group_chat_messages
ADD COLUMN IF NOT EXISTS sos_location JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sos_timestamp TIMESTAMPTZ DEFAULT NULL;

-- Update the message_type check constraint to include 'sos'
ALTER TABLE group_chat_messages
DROP CONSTRAINT IF EXISTS group_chat_messages_message_type_check;

ALTER TABLE group_chat_messages
ADD CONSTRAINT group_chat_messages_message_type_check
CHECK (message_type IN ('text', 'voice', 'sos'));

-- Add index for faster SOS message queries
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_sos
ON group_chat_messages(group_id, message_type)
WHERE message_type = 'sos';

-- Add comment explaining the new fields
COMMENT ON COLUMN group_chat_messages.sos_location IS 'GPS coordinates for SOS alerts in format: {"lat": 12.34, "lng": 56.78}';
COMMENT ON COLUMN group_chat_messages.sos_timestamp IS 'Timestamp when SOS was activated (may differ from created_at)';

-- Grant permissions (if using RLS)
-- ALTER POLICY IF EXISTS "Group members can view messages" ON group_chat_messages USING (true);
-- ALTER POLICY IF EXISTS "Group members can insert messages" ON group_chat_messages WITH CHECK (true);

-- Verification query
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'group_chat_messages'
  AND column_name IN ('sos_location', 'sos_timestamp', 'message_type');

-- Sample query to retrieve SOS alerts
-- SELECT 
--   id,
--   sender_name,
--   message_type,
--   sos_location,
--   sos_timestamp,
--   created_at
-- FROM group_chat_messages
-- WHERE message_type = 'sos'
-- ORDER BY created_at DESC;

