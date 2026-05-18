-- =============================================================
-- 014 - Add admin_notes and flags_dismissed to interest_list
-- Run this in the Supabase SQL Editor.
--
-- admin_notes: private notes field for Kacee to record review
--   context, follow-up items, or any other internal information.
--   Never shared with the applicant.
--
-- flags_dismissed: JSONB array of flag IDs Kacee has cleared
--   after reviewing them. Dismissal is per-applicant so each
--   flag can be restored individually if needed.
-- =============================================================

ALTER TABLE interest_list
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS flags_dismissed JSONB DEFAULT '[]';
