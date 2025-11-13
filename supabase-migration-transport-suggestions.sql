-- Migration: Add transport suggestions and home location
-- Run this in Supabase SQL Editor after the main schema is applied

-- 1. Add home_location to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS home_location TEXT;

-- 2. Add transport suggestion fields to group_itinerary_activities
ALTER TABLE group_itinerary_activities
ADD COLUMN IF NOT EXISTS suggested_transport TEXT CHECK (suggested_transport IN ('flight', 'train', 'bus', NULL)),
ADD COLUMN IF NOT EXISTS origin_city TEXT,
ADD COLUMN IF NOT EXISTS destination_city TEXT,
ADD COLUMN IF NOT EXISTS travel_date DATE;

-- Add index for faster queries on transport suggestions
CREATE INDEX IF NOT EXISTS idx_itinerary_transport ON group_itinerary_activities(group_id, travel_date, suggested_transport) 
WHERE suggested_transport IS NOT NULL;

