-- =============================================================
-- 017 - Add entry_type to interest_list
-- Run this in the Supabase SQL Editor.
--
-- entry_type: 'form' (submitted via public questionnaire, default)
--             'manual' (added directly by Kacee in the admin portal)
--
-- Manual entries skip automated emails and default to
-- 'reviewing' status. Both entry types are included in the
-- matching engine and are visible in the Interest List tab.
-- =============================================================

ALTER TABLE interest_list
  ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'form';
