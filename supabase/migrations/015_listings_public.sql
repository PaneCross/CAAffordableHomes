-- =============================================================
-- 015 - Add public-display fields to listings table
-- Run this in the Supabase SQL Editor.
--
-- Enables each listing to serve as its own public card on the
-- website. Adds show_on_site toggle, MLS listed toggle,
-- community/development name, home type, features, comments,
-- AMI percentage, and public status label.
--
-- Also adds a SELECT RLS policy for the anon role so the
-- public programs.js page can fetch show_on_site = true rows
-- without authentication.
-- =============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS show_on_site    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mls_listed      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS community_name  TEXT,
  ADD COLUMN IF NOT EXISTS home_type       TEXT,
  ADD COLUMN IF NOT EXISTS features        TEXT,
  ADD COLUMN IF NOT EXISTS comments        TEXT,
  ADD COLUMN IF NOT EXISTS ami_percent     INTEGER,
  ADD COLUMN IF NOT EXISTS public_status   TEXT DEFAULT 'Available';

-- Allow anonymous visitors to read listings marked for public display.
-- Authenticated users already have full access via existing policies.
CREATE POLICY "anon can view public listings"
  ON listings
  FOR SELECT
  TO anon
  USING (show_on_site = TRUE);
