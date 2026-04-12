-- =============================================================
-- CA Affordable Homes — Match Pipeline
-- Adds units_available to listings, listing_candidates table,
-- and successes table.
-- Run in Supabase SQL Editor.
-- =============================================================

-- Add units_available to listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS units_available INTEGER DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────
-- LISTING CANDIDATES
-- Tracks Kacee's manual in-review pipeline per listing.
-- Separate from match_results (algorithm output).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_candidates (
  id              BIGSERIAL PRIMARY KEY,
  listing_id      TEXT NOT NULL,
  email           TEXT NOT NULL,
  full_name       TEXT,
  il_submitted_at TIMESTAMPTZ,   -- copied from interest_list.submitted_at for priority ordering
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'in_review', -- in_review | approved | declined
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS listing_candidates_listing_idx ON listing_candidates (listing_id);
CREATE INDEX IF NOT EXISTS listing_candidates_email_idx   ON listing_candidates (email);
CREATE INDEX IF NOT EXISTS listing_candidates_status_idx  ON listing_candidates (status);

ALTER TABLE listing_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access to listing_candidates"
  ON listing_candidates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- SUCCESSES
-- Append-only log of approved matches.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS successes (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   TEXT,
  listing_name TEXT,
  email        TEXT,
  full_name    TEXT,
  approved_at  TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS successes_listing_idx ON successes (listing_id);
CREATE INDEX IF NOT EXISTS successes_approved_idx ON successes (approved_at DESC);

ALTER TABLE successes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access to successes"
  ON successes FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
