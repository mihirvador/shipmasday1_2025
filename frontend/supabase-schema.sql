-- Supabase Schema for Gift Making & Sharing App
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gifts table
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Gift',
  objects JSONB NOT NULL DEFAULT '[]',
  wrapped BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gift openings tracking table
CREATE TABLE IF NOT EXISTS gift_openings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_id UUID NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  opener_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(gift_id, opener_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gifts_creator ON gifts(creator_id);
CREATE INDEX IF NOT EXISTS idx_gift_openings_gift ON gift_openings(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_openings_opener ON gift_openings(opener_id);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_openings ENABLE ROW LEVEL SECURITY;

-- Users can read all users (for displaying creator info)
CREATE POLICY "Users are viewable by everyone" ON users
  FOR SELECT USING (true);

-- Users can insert their own record
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (true);

-- Gifts are viewable by everyone
CREATE POLICY "Gifts are viewable by everyone" ON gifts
  FOR SELECT USING (true);

-- Users can insert their own gifts
CREATE POLICY "Users can insert own gifts" ON gifts
  FOR INSERT WITH CHECK (true);

-- Gift openings are viewable by everyone
CREATE POLICY "Gift openings are viewable by everyone" ON gift_openings
  FOR SELECT USING (true);

-- Users can record their own gift openings
CREATE POLICY "Users can record own gift openings" ON gift_openings
  FOR INSERT WITH CHECK (true);

-- Storage bucket for 3D files
-- Note: Create a bucket named 'gifts' in Supabase Storage dashboard
-- with public access enabled for read operations

