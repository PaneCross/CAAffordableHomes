-- Migration 007: Add status_history column to interest_list
-- Tracks every admin status change as a chronological JSONB array.
-- Each entry: { "status": "reviewing", "ts": "2024-01-15T14:00:00Z", "note": "..." }
-- Special entries use "event" key instead of "status" for non-status actions.

ALTER TABLE interest_list
  ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;
