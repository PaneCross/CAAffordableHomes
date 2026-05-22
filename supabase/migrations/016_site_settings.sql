-- =============================================================
-- 016 - Create site_settings table
-- Run this in the Supabase SQL Editor.
--
-- A simple key/value store for global site configuration.
-- Initially used to store the AMI PDF download URL uploaded
-- by Kacee via the admin portal.
-- =============================================================

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors can read settings (needed for PDF link on public page)
CREATE POLICY "anon read site_settings"
  ON site_settings
  FOR SELECT
  TO anon
  USING (TRUE);

-- Authenticated admins can read and write all settings
CREATE POLICY "authenticated manage site_settings"
  ON site_settings
  FOR ALL
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- Seed the AMI PDF URL key (value set via admin upload)
INSERT INTO site_settings (key, value)
VALUES ('ami_pdf_url', '')
ON CONFLICT (key) DO NOTHING;
