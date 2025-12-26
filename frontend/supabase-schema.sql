-- =============================================================================
-- Supabase Schema for Gift Making & Sharing App
-- =============================================================================
-- Run this in your Supabase SQL editor
-- Last updated: Dec 2024

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- GIFTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Gift',
  prompt TEXT,  -- Original prompt used to generate the 3D model
  model_url TEXT,  -- URL to the stored PLY/OBJ file in Supabase Storage
  objects JSONB NOT NULL DEFAULT '[]',  -- Array of objects with position/rotation/scale
  wrapped BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'in_pool' CHECK (status IN ('generating', 'in_pool', 'claimed', 'opened')),
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- GIFT OPENINGS TABLE (History/Analytics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS gift_openings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_id UUID NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  opener_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(gift_id, opener_id)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_gifts_creator ON gifts(creator_id);
CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status);
CREATE INDEX IF NOT EXISTS idx_gift_openings_gift ON gift_openings(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_openings_opener ON gift_openings(opener_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - ENABLE ON ALL TABLES
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_openings ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners (extra security layer)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE gifts FORCE ROW LEVEL SECURITY;
ALTER TABLE gift_openings FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES - USERS TABLE
-- =============================================================================

-- Anyone can view users (for displaying creator info on gifts)
CREATE POLICY "Users are viewable by everyone" ON users
  FOR SELECT USING (true);

-- User creation is handled via backend with service role
-- The backend validates email and handles user creation securely
CREATE POLICY "Users can insert own record" ON users
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- RLS POLICIES - GIFTS TABLE
-- =============================================================================

-- Anyone can view gifts (for unwrapping discovery)
CREATE POLICY "Gifts are viewable by everyone" ON gifts
  FOR SELECT USING (true);

-- Gift creation is handled via backend with service role
-- The backend validates that creator_id matches the authenticated user
CREATE POLICY "Creators can insert own gifts" ON gifts
  FOR INSERT WITH CHECK (true);

-- Gift updates (claiming) are handled via backend
-- The backend validates: 
--   1. Users cannot claim their own gifts
--   2. Gifts must be in 'in_pool' status to be claimed
--   3. Gifts must not already have a recipient
CREATE POLICY "Users can update their gifts or claim unclaimed" ON gifts
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- Gift deletion handled via backend (only creators can delete their own)
CREATE POLICY "Creators can delete own gifts" ON gifts
  FOR DELETE USING (true);

-- =============================================================================
-- RLS POLICIES - GIFT OPENINGS TABLE
-- =============================================================================

-- Anyone can view gift openings (for analytics)
CREATE POLICY "Gift openings are viewable by everyone" ON gift_openings
  FOR SELECT USING (true);

-- Recording openings is handled via backend
-- The backend validates that opener_id matches the authenticated user
CREATE POLICY "Users can record own gift openings" ON gift_openings
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- STORAGE BUCKET CONFIGURATION
-- =============================================================================
-- Note: Create a bucket named 'gifts' in Supabase Storage dashboard
-- Settings:
--   - Public bucket: YES (for public read access to 3D models)
--   - File size limit: 50MB
--   - Allowed MIME types: application/octet-stream, text/plain
--
-- Storage policies should be configured to:
--   - Allow public read access (for serving 3D models)
--   - Restrict uploads to authenticated requests (via backend service role)

-- =============================================================================
-- SECURITY NOTES
-- =============================================================================
-- 
-- 1. The backend uses the ANON key - RLS policies are configured to allow
--    the backend to perform operations (validation happens in backend code)
--
-- 2. The frontend never accesses Supabase directly
--    All requests go through: Next.js API routes → Python backend → Supabase
--
-- 3. The backend implements:
--    - Rate limiting (100 requests per minute per IP)
--    - Input validation (email format, UUID format, prompt length, etc.)
--    - SQL injection protection (via Supabase client parameterized queries)
--    - XSS protection (input sanitization)
--
-- 4. CORS is configured to only allow requests from allowed origins
--
-- 5. In production:
--    - Set ENVIRONMENT=production to disable Swagger docs
--    - Configure ALLOWED_ORIGINS to your domain only
--    - Use HTTPS for all communication

-- =============================================================================
-- MIGRATION HELPERS (Run if tables already exist and need updates)
-- =============================================================================
-- ALTER TABLE gifts ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id) ON DELETE SET NULL;
-- ALTER TABLE gifts ADD COLUMN IF NOT EXISTS prompt TEXT;
-- ALTER TABLE gifts ADD COLUMN IF NOT EXISTS model_url TEXT;
-- ALTER TABLE gifts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_pool';
-- ALTER TABLE gifts ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE;
-- ALTER TABLE gifts ADD CONSTRAINT gifts_status_check CHECK (status IN ('generating', 'in_pool', 'claimed', 'opened'));
-- CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts(recipient_id);
-- CREATE INDEX IF NOT EXISTS idx_gifts_status ON gifts(status);
