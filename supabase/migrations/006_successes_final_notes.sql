-- Add final_notes to successes table
ALTER TABLE successes ADD COLUMN IF NOT EXISTS final_notes TEXT;
