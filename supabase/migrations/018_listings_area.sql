-- =============================================================
-- 018 - Add area field to listings table
-- Run this in the Supabase SQL Editor.
--
-- area: general geographic description shown on non-MLS public
--       listing cards (e.g. "South Bay", "North County Coastal").
--       MLS listings show community_name + full address instead.
-- =============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS area TEXT;
