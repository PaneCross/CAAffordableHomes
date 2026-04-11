-- =============================================================
-- CA Affordable Homes — Full Database Schema
-- Run this once in the Supabase SQL Editor
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- INTEREST LIST
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interest_list (
  id                        BIGSERIAL PRIMARY KEY,
  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                    TEXT        NOT NULL DEFAULT 'new',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_signup_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  renewal_reminder_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Section I — Personal
  full_name                 TEXT,
  phone                     TEXT,
  email                     TEXT NOT NULL,
  owned_real_estate         TEXT,
  household_size            TEXT,
  lived_together_12mo       TEXT,
  live_in_sd_county         TEXT,
  credit_score_self         TEXT,
  credit_score_coborrower   TEXT,
  monthly_rent              TEXT,
  rent_subsidized           TEXT,
  rent_subsidy_amount       TEXT,
  worked_lived_sd_2yr       TEXT,
  sdhc_prior_purchase       TEXT,
  -- Section II — Income members (up to 6)
  income_1_name             TEXT, income_1_relationship TEXT, income_1_annual TEXT,
  income_2_name             TEXT, income_2_relationship TEXT, income_2_annual TEXT,
  income_3_name             TEXT, income_3_relationship TEXT, income_3_annual TEXT,
  income_4_name             TEXT, income_4_relationship TEXT, income_4_annual TEXT,
  income_5_name             TEXT, income_5_relationship TEXT, income_5_annual TEXT,
  income_6_name             TEXT, income_6_relationship TEXT, income_6_annual TEXT,
  -- Tax-year income
  tax_year_labels           TEXT,
  tax_1_total               TEXT, tax_1_sched_c TEXT,
  tax_2_total               TEXT, tax_2_sched_c TEXT,
  tax_3_total               TEXT, tax_3_sched_c TEXT,
  -- Non-taxable income (up to 3)
  non_taxable_income        TEXT,
  nontax_1_who              TEXT, nontax_1_source TEXT, nontax_1_amount TEXT,
  nontax_1_end_date_yn      TEXT, nontax_1_end_date TEXT,
  nontax_2_who              TEXT, nontax_2_source TEXT, nontax_2_amount TEXT,
  nontax_2_end_date_yn      TEXT, nontax_2_end_date TEXT,
  nontax_3_who              TEXT, nontax_3_source TEXT, nontax_3_amount TEXT,
  nontax_3_end_date_yn      TEXT, nontax_3_end_date TEXT,
  -- Real estate agent
  agent_yn                  TEXT, agent_name TEXT, agent_email TEXT,
  agent_phone               TEXT, agent_dre  TEXT,
  -- Section III — Employment (up to 4)
  emp_1_name TEXT, emp_1_relationship TEXT, emp_1_employer TEXT, emp_1_status TEXT,
  emp_1_end_date TEXT, emp_1_same_line TEXT, emp_1_start_date TEXT,
  emp_1_breaks TEXT, emp_1_breaks_desc TEXT, emp_1_income_type TEXT,
  emp_1_annual_salary TEXT, emp_1_hourly_rate TEXT, emp_1_hours_per_week TEXT,
  emp_1_ytd_gross TEXT, emp_1_pay_period_end TEXT, emp_1_w2_recent TEXT,

  emp_2_name TEXT, emp_2_relationship TEXT, emp_2_employer TEXT, emp_2_status TEXT,
  emp_2_end_date TEXT, emp_2_same_line TEXT, emp_2_start_date TEXT,
  emp_2_breaks TEXT, emp_2_breaks_desc TEXT, emp_2_income_type TEXT,
  emp_2_annual_salary TEXT, emp_2_hourly_rate TEXT, emp_2_hours_per_week TEXT,
  emp_2_ytd_gross TEXT, emp_2_pay_period_end TEXT, emp_2_w2_recent TEXT,

  emp_3_name TEXT, emp_3_relationship TEXT, emp_3_employer TEXT, emp_3_status TEXT,
  emp_3_end_date TEXT, emp_3_same_line TEXT, emp_3_start_date TEXT,
  emp_3_breaks TEXT, emp_3_breaks_desc TEXT, emp_3_income_type TEXT,
  emp_3_annual_salary TEXT, emp_3_hourly_rate TEXT, emp_3_hours_per_week TEXT,
  emp_3_ytd_gross TEXT, emp_3_pay_period_end TEXT, emp_3_w2_recent TEXT,

  emp_4_name TEXT, emp_4_relationship TEXT, emp_4_employer TEXT, emp_4_status TEXT,
  emp_4_end_date TEXT, emp_4_same_line TEXT, emp_4_start_date TEXT,
  emp_4_breaks TEXT, emp_4_breaks_desc TEXT, emp_4_income_type TEXT,
  emp_4_annual_salary TEXT, emp_4_hourly_rate TEXT, emp_4_hours_per_week TEXT,
  emp_4_ytd_gross TEXT, emp_4_pay_period_end TEXT, emp_4_w2_recent TEXT,
  -- Section IV — Financial & Disclosures
  monthly_debt_payments     TEXT,
  foreclosure               TEXT, foreclosure_date TEXT,
  bankruptcy                TEXT, bankruptcy_discharge_date TEXT,
  judgments                 TEXT, judgments_description TEXT,
  us_citizen                TEXT, permanent_resident TEXT,
  asset_checking            TEXT, asset_savings TEXT,
  asset_401k                TEXT, asset_other TEXT,
  loan_signers              TEXT, household_members TEXT,
  additional_info           TEXT, area_preference TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS interest_list_email_lower ON interest_list (LOWER(email));
CREATE INDEX IF NOT EXISTS interest_list_status_idx ON interest_list (status);
CREATE INDEX IF NOT EXISTS interest_list_submitted_idx ON interest_list (submitted_at DESC);

-- ─────────────────────────────────────────────────────────────
-- LISTINGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id                          BIGSERIAL PRIMARY KEY,
  listing_id                  TEXT UNIQUE NOT NULL,
  listing_name                TEXT,
  active                      TEXT DEFAULT 'NO',
  ami_percent                 TEXT,
  min_household_size          TEXT,
  max_household_size          TEXT,
  max_income_1person          TEXT,
  max_income_2person          TEXT,
  max_income_3person          TEXT,
  max_income_4person          TEXT,
  max_income_5person          TEXT,
  max_income_6person          TEXT,
  min_income                  TEXT,
  min_credit_score            TEXT,
  max_dti_percent             TEXT,
  max_monthly_debt            TEXT,
  first_time_buyer_required   TEXT,
  no_ownership_years          TEXT,
  sd_county_residency_required TEXT,
  sd_residency_months         TEXT,
  household_together_months   TEXT,
  sdhc_prior_purchase_allowed TEXT,
  foreclosure_allowed         TEXT,
  foreclosure_min_years       TEXT,
  bankruptcy_allowed          TEXT,
  bankruptcy_min_years        TEXT,
  judgments_allowed           TEXT,
  citizenship_required        TEXT,
  permanent_resident_acceptable TEXT,
  min_assets                  TEXT,
  max_assets                  TEXT,
  min_down_payment_pct        TEXT,
  max_down_payment_pct        TEXT,
  min_employment_months       TEXT,
  program_notes               TEXT,
  address                     TEXT,
  city                        TEXT,
  price                       TEXT,
  bedrooms                    TEXT,
  bathrooms                   TEXT,
  sqft                        TEXT,
  listing_type                TEXT DEFAULT 'affordable',
  program_type                TEXT,
  internal_notes              TEXT,
  source_submission_row       TEXT,
  linked_program_id           TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listings_active_idx ON listings (active);
CREATE INDEX IF NOT EXISTS listings_linked_program_idx ON listings (linked_program_id);

-- ─────────────────────────────────────────────────────────────
-- PROGRAMS  (what gets shown on the public site via programs.js)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
  id                    BIGSERIAL PRIMARY KEY,
  community_name        TEXT NOT NULL,
  area                  TEXT,
  program_type          TEXT,
  ami_range             TEXT,
  bedrooms              TEXT,
  household_size_limit  TEXT,
  first_time_buyer      TEXT,
  price_range           TEXT,
  status                TEXT DEFAULT 'Available',
  notes                 TEXT,
  source_listing_id     TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS programs_status_idx ON programs (status);

-- ─────────────────────────────────────────────────────────────
-- PROPERTY SUBMISSIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_submissions (
  id                    BIGSERIAL PRIMARY KEY,
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  status                TEXT DEFAULT 'new',
  contact_name          TEXT,
  contact_org           TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  prop_address          TEXT,
  affordable_count      TEXT,
  bedrooms              TEXT,
  bathrooms             TEXT,
  move_in_date          TEXT,
  marketing_start       TEXT,
  ami_percent           TEXT,
  affordable_price      TEXT,
  hoa_fee               TEXT,
  hoa_covers            TEXT,
  prop_tax_pct          TEXT,
  special_assessments   TEXT,
  deed_restriction_years TEXT,
  solar                 TEXT,
  solar_included        TEXT,
  solar_lease_amount    TEXT,
  file_links            TEXT,
  promoted_to           TEXT
);

-- ─────────────────────────────────────────────────────────────
-- MATCH RESULTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_results (
  id            BIGSERIAL PRIMARY KEY,
  listing_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  full_name     TEXT,
  status        TEXT,
  failed_fields TEXT,
  scored_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (listing_id, email)
);

CREATE INDEX IF NOT EXISTS match_results_listing_idx ON match_results (listing_id);
CREATE INDEX IF NOT EXISTS match_results_status_idx  ON match_results (status);

-- ─────────────────────────────────────────────────────────────
-- TESTIMONIALS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS testimonials (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT,
  quote       TEXT,
  role        TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE interest_list        ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials         ENABLE ROW LEVEL SECURITY;

-- Interest List: public can INSERT (form submissions); admin reads/writes all
CREATE POLICY "Public can submit interest list"
  ON interest_list FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "Admin full access to interest_list"
  ON interest_list FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Listings: admin only
CREATE POLICY "Admin full access to listings"
  ON listings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Programs: public can read Available/Coming Soon; admin writes
CREATE POLICY "Public can read active programs"
  ON programs FOR SELECT TO anon
  USING (status IN ('Available', 'Coming Soon'));

CREATE POLICY "Admin full access to programs"
  ON programs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Property Submissions: public can INSERT; admin reads/writes
CREATE POLICY "Public can submit property submissions"
  ON property_submissions FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "Admin full access to property_submissions"
  ON property_submissions FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Match Results: admin only
CREATE POLICY "Admin full access to match_results"
  ON match_results FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Testimonials: public can read active ones; admin writes
CREATE POLICY "Public can read active testimonials"
  ON testimonials FOR SELECT TO anon USING (active = TRUE);

CREATE POLICY "Admin full access to testimonials"
  ON testimonials FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- =============================================================
-- UPSERT FUNCTION — handles interest list deduplication
-- Called by the submit-interest Edge Function
-- =============================================================
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
    -- New applicant
    INSERT INTO interest_list
    SELECT * FROM jsonb_populate_record(NULL::interest_list, payload)
    ON CONFLICT DO NOTHING;
    -- Fill system fields
    UPDATE interest_list SET
      submitted_at       = v_now,
      updated_at         = v_now,
      original_signup_at = v_now,
      status             = 'new',
      renewal_reminder_sent = FALSE
    WHERE LOWER(email) = v_email;
    v_result_type := 'new';

  ELSIF v_existing.status = 'expired' THEN
    -- Re-enrollment: reset clock, restore active, preserve original_signup_at
    UPDATE interest_list SET
      status                = 'active',
      submitted_at          = v_now,
      updated_at            = v_now,
      renewal_reminder_sent = FALSE,
      full_name             = COALESCE(payload->>'full_name', full_name),
      phone                 = COALESCE(payload->>'phone', phone),
      owned_real_estate     = payload->>'owned_real_estate',
      household_size        = payload->>'household_size',
      lived_together_12mo   = payload->>'lived_together_12mo',
      live_in_sd_county     = payload->>'live_in_sd_county',
      credit_score_self     = payload->>'credit_score_self',
      credit_score_coborrower = payload->>'credit_score_coborrower',
      monthly_rent          = payload->>'monthly_rent',
      monthly_debt_payments = payload->>'monthly_debt_payments',
      foreclosure           = payload->>'foreclosure',
      foreclosure_date      = payload->>'foreclosure_date',
      bankruptcy            = payload->>'bankruptcy',
      bankruptcy_discharge_date = payload->>'bankruptcy_discharge_date',
      judgments             = payload->>'judgments',
      judgments_description = payload->>'judgments_description',
      us_citizen            = payload->>'us_citizen',
      permanent_resident    = payload->>'permanent_resident',
      asset_checking        = payload->>'asset_checking',
      asset_savings         = payload->>'asset_savings',
      asset_401k            = payload->>'asset_401k',
      asset_other           = payload->>'asset_other',
      worked_lived_sd_2yr   = payload->>'worked_lived_sd_2yr',
      sdhc_prior_purchase   = payload->>'sdhc_prior_purchase',
      area_preference       = payload->>'area_preference',
      additional_info       = payload->>'additional_info'
    WHERE id = v_existing.id;
    v_result_type := 're_enrollment';

  ELSE
    -- Regular update: preserve status, submitted_at, renewal_reminder_sent, original_signup_at
    UPDATE interest_list SET
      updated_at            = v_now,
      full_name             = COALESCE(payload->>'full_name', full_name),
      phone                 = COALESCE(payload->>'phone', phone),
      owned_real_estate     = payload->>'owned_real_estate',
      household_size        = payload->>'household_size',
      lived_together_12mo   = payload->>'lived_together_12mo',
      live_in_sd_county     = payload->>'live_in_sd_county',
      credit_score_self     = payload->>'credit_score_self',
      credit_score_coborrower = payload->>'credit_score_coborrower',
      monthly_rent          = payload->>'monthly_rent',
      monthly_debt_payments = payload->>'monthly_debt_payments',
      foreclosure           = payload->>'foreclosure',
      foreclosure_date      = payload->>'foreclosure_date',
      bankruptcy            = payload->>'bankruptcy',
      bankruptcy_discharge_date = payload->>'bankruptcy_discharge_date',
      judgments             = payload->>'judgments',
      judgments_description = payload->>'judgments_description',
      us_citizen            = payload->>'us_citizen',
      permanent_resident    = payload->>'permanent_resident',
      asset_checking        = payload->>'asset_checking',
      asset_savings         = payload->>'asset_savings',
      asset_401k            = payload->>'asset_401k',
      asset_other           = payload->>'asset_other',
      worked_lived_sd_2yr   = payload->>'worked_lived_sd_2yr',
      sdhc_prior_purchase   = payload->>'sdhc_prior_purchase',
      area_preference       = payload->>'area_preference',
      additional_info       = payload->>'additional_info'
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

-- Grant execute to anon (called from Edge Function which uses service key, but keep safe)
GRANT EXECUTE ON FUNCTION upsert_interest_list(JSONB) TO service_role;
