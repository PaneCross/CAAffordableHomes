-- =============================================================
-- Phase 11 schema changes
-- Run in Supabase SQL Editor
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- PROGRAMS: add zip_code, property_type, ami_percent
-- Remove first_time_buyer + program_type + household_size_limit
-- from the UI only (columns left in place to avoid data loss)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS zip_code      TEXT,
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS ami_percent   TEXT;

-- ─────────────────────────────────────────────────────────────
-- LISTINGS: add ami_table JSONB + units_available
-- Old income columns left in place for safe migration;
-- matching engine will prefer ami_table when present
-- ─────────────────────────────────────────────────────────────
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ami_table       JSONB,
  ADD COLUMN IF NOT EXISTS units_available INTEGER;

-- ─────────────────────────────────────────────────────────────
-- INTEREST LIST: extend income members to 8
-- ─────────────────────────────────────────────────────────────
ALTER TABLE interest_list
  ADD COLUMN IF NOT EXISTS income_7_name         TEXT,
  ADD COLUMN IF NOT EXISTS income_7_relationship TEXT,
  ADD COLUMN IF NOT EXISTS income_7_annual       TEXT,
  ADD COLUMN IF NOT EXISTS income_8_name         TEXT,
  ADD COLUMN IF NOT EXISTS income_8_relationship TEXT,
  ADD COLUMN IF NOT EXISTS income_8_annual       TEXT;

-- ─────────────────────────────────────────────────────────────
-- ORG INQUIRIES: new table for partnership inquiry form
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_inquiries (
  id            BIGSERIAL PRIMARY KEY,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT        NOT NULL DEFAULT 'new',
  contact_name  TEXT,
  organization  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  message       TEXT
);

CREATE INDEX IF NOT EXISTS org_inquiries_status_idx ON org_inquiries (status);
CREATE INDEX IF NOT EXISTS org_inquiries_submitted_idx ON org_inquiries (submitted_at DESC);

ALTER TABLE org_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit org inquiries"
  ON org_inquiries FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "Admin full access to org_inquiries"
  ON org_inquiries FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- Update upsert_interest_list to include income members 7 + 8
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_interest_list(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email       TEXT := LOWER(TRIM(payload->>'email'));
  v_existing    interest_list%ROWTYPE;
  v_now         TIMESTAMPTZ := NOW();
  v_status      TEXT;
  v_result_type TEXT;
BEGIN
  SELECT * INTO v_existing FROM interest_list WHERE LOWER(email) = v_email;

  IF NOT FOUND THEN
    INSERT INTO interest_list
    SELECT * FROM jsonb_populate_record(NULL::interest_list, payload)
    ON CONFLICT DO NOTHING;
    UPDATE interest_list SET
      submitted_at          = v_now,
      updated_at            = v_now,
      original_signup_at    = v_now,
      status                = 'new',
      renewal_reminder_sent = FALSE
    WHERE LOWER(email) = v_email;
    v_result_type := 'new';

  ELSIF v_existing.status = 'expired' THEN
    UPDATE interest_list SET
      status                    = 'active',
      submitted_at              = v_now,
      updated_at                = v_now,
      renewal_reminder_sent     = FALSE,
      full_name                 = COALESCE(payload->>'full_name', full_name),
      phone                     = COALESCE(payload->>'phone', phone),
      owned_real_estate         = payload->>'owned_real_estate',
      household_size            = payload->>'household_size',
      lived_together_12mo       = payload->>'lived_together_12mo',
      live_in_sd_county         = payload->>'live_in_sd_county',
      credit_score_self         = payload->>'credit_score_self',
      credit_score_coborrower   = payload->>'credit_score_coborrower',
      monthly_rent              = payload->>'monthly_rent',
      monthly_debt_payments     = payload->>'monthly_debt_payments',
      foreclosure               = payload->>'foreclosure',
      foreclosure_date          = payload->>'foreclosure_date',
      bankruptcy                = payload->>'bankruptcy',
      bankruptcy_discharge_date = payload->>'bankruptcy_discharge_date',
      judgments                 = payload->>'judgments',
      judgments_description     = payload->>'judgments_description',
      us_citizen                = payload->>'us_citizen',
      permanent_resident        = payload->>'permanent_resident',
      asset_checking            = payload->>'asset_checking',
      asset_savings             = payload->>'asset_savings',
      asset_401k                = payload->>'asset_401k',
      asset_other               = payload->>'asset_other',
      worked_lived_sd_2yr       = payload->>'worked_lived_sd_2yr',
      sdhc_prior_purchase       = payload->>'sdhc_prior_purchase',
      area_preference           = payload->>'area_preference',
      additional_info           = payload->>'additional_info',
      income_7_name             = payload->>'income_7_name',
      income_7_relationship     = payload->>'income_7_relationship',
      income_7_annual           = payload->>'income_7_annual',
      income_8_name             = payload->>'income_8_name',
      income_8_relationship     = payload->>'income_8_relationship',
      income_8_annual           = payload->>'income_8_annual'
    WHERE id = v_existing.id;
    v_result_type := 're_enrollment';

  ELSE
    UPDATE interest_list SET
      updated_at                = v_now,
      full_name                 = COALESCE(payload->>'full_name', full_name),
      phone                     = COALESCE(payload->>'phone', phone),
      owned_real_estate         = payload->>'owned_real_estate',
      household_size            = payload->>'household_size',
      lived_together_12mo       = payload->>'lived_together_12mo',
      live_in_sd_county         = payload->>'live_in_sd_county',
      credit_score_self         = payload->>'credit_score_self',
      credit_score_coborrower   = payload->>'credit_score_coborrower',
      monthly_rent              = payload->>'monthly_rent',
      monthly_debt_payments     = payload->>'monthly_debt_payments',
      foreclosure               = payload->>'foreclosure',
      foreclosure_date          = payload->>'foreclosure_date',
      bankruptcy                = payload->>'bankruptcy',
      bankruptcy_discharge_date = payload->>'bankruptcy_discharge_date',
      judgments                 = payload->>'judgments',
      judgments_description     = payload->>'judgments_description',
      us_citizen                = payload->>'us_citizen',
      permanent_resident        = payload->>'permanent_resident',
      asset_checking            = payload->>'asset_checking',
      asset_savings             = payload->>'asset_savings',
      asset_401k                = payload->>'asset_401k',
      asset_other               = payload->>'asset_other',
      worked_lived_sd_2yr       = payload->>'worked_lived_sd_2yr',
      sdhc_prior_purchase       = payload->>'sdhc_prior_purchase',
      area_preference           = payload->>'area_preference',
      additional_info           = payload->>'additional_info',
      income_7_name             = payload->>'income_7_name',
      income_7_relationship     = payload->>'income_7_relationship',
      income_7_annual           = payload->>'income_7_annual',
      income_8_name             = payload->>'income_8_name',
      income_8_relationship     = payload->>'income_8_relationship',
      income_8_annual           = payload->>'income_8_annual'
    WHERE id = v_existing.id;
    v_result_type := 'updated';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'type', v_result_type,
    'full_name', COALESCE(payload->>'full_name', v_existing.full_name),
    'email', v_email
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_interest_list(JSONB) TO service_role;
