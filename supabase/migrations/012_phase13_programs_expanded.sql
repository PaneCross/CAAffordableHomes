-- =============================================================
-- 012 — Phase 13: Programs expanded display fields + listings parking
-- Run this in the Supabase SQL Editor.
--
-- Adds 7 new manual fields to programs for public card display:
--   mls_listed, full_address, bathrooms, parking, sqft,
--   program_type, selection_process
--
-- Adds parking to listings (bathrooms/sqft/program_type already exist).
--
-- All fields use IF NOT EXISTS so this is safe to re-run.
-- =============================================================

-- Programs: new display fields (all manual, Kacee fills them in)
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS mls_listed        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS full_address      TEXT,
  ADD COLUMN IF NOT EXISTS bathrooms         TEXT,
  ADD COLUMN IF NOT EXISTS parking           TEXT,
  ADD COLUMN IF NOT EXISTS sqft              TEXT,
  ADD COLUMN IF NOT EXISTS program_type      TEXT,
  ADD COLUMN IF NOT EXISTS selection_process TEXT;

-- Listings: parking field (bathrooms/sqft/program_type already added in Phase 11)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS parking TEXT;

-- Note: RLS on programs already allows anon SELECT *.
-- The sync_program_from_listings function is NOT updated here;
-- bathrooms/parking/sqft/program_type/selection_process on programs
-- are always manual and are never auto-calculated from listings.
