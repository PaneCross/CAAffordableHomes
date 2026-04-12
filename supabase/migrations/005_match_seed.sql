-- =============================================================
-- CA Affordable Homes — Match Pipeline Seed Data
-- Adds two applicants who produce Pass results, sets
-- units_available on active listings, and seeds match_results
-- so the Matches tab is testable immediately.
-- Run in Supabase SQL Editor.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Set units_available on active listings
-- ─────────────────────────────────────────────────────────────
UPDATE listings SET units_available = 2 WHERE listing_id = 'LST-001';
UPDATE listings SET units_available = 1 WHERE listing_id = 'LST-002';
UPDATE listings SET units_available = 3 WHERE listing_id = 'LST-003';

-- ─────────────────────────────────────────────────────────────
-- New interest list applicants
-- David Park  — clean profile, income within 60-80% AMI →
--               designed to Pass all 3 active listings
-- Sofia Reyes — income within 80-120% AMI for most listings →
--               designed to Pass LST-001 and LST-003,
--               Close on LST-002 (income $1k over 3-person cap)
-- ─────────────────────────────────────────────────────────────
INSERT INTO interest_list (
  submitted_at, updated_at, original_signup_at, status, renewal_reminder_sent,
  full_name, phone, email,
  owned_real_estate, household_size, lived_together_12mo,
  live_in_sd_county, credit_score_self, monthly_rent,
  worked_lived_sd_2yr, sdhc_prior_purchase,
  income_1_name, income_1_relationship, income_1_annual,
  monthly_debt_payments, foreclosure, bankruptcy, judgments,
  us_citizen, permanent_resident,
  asset_checking, asset_savings, asset_401k,
  area_preference,
  emp_1_name, emp_1_relationship, emp_1_employer, emp_1_status,
  emp_1_start_date, emp_1_income_type, emp_1_annual_salary,
  emp_1_ytd_gross, emp_1_pay_period_end
) VALUES
(
  NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '20 days', 'new', false,
  'David Park', '(619) 555-4401', 'david.park@gmail.com',
  'No', '2', 'Yes',
  'Yes', '710', '1600',
  'Yes', 'No',
  'David Park', 'Self', '58000',
  '450', 'No', 'No', 'No',
  'Yes', 'No',
  '3200', '8800', '15000',
  'South Bay; Central San Diego',
  'David Park', 'Self', 'County of San Diego', 'Current',
  '2020-05', 'W-2', '58000',
  '21000', '2025-03-31'
),
(
  NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days',
  NOW() - INTERVAL '55 days', 'active', false,
  'Sofia Reyes', '(858) 555-7712', 'sofia.reyes@outlook.com',
  'No', '3', 'Yes',
  'Yes', '720', '2400',
  'Yes', 'No',
  'Sofia Reyes', 'Self', '75000',
  '600', 'No', 'No', 'No',
  'Yes', 'No',
  '4100', '11500', '22000',
  'North County Coastal; Central San Diego',
  'Sofia Reyes', 'Self', 'Scripps Health', 'Current',
  '2019-09', 'W-2', '75000',
  '29500', '2025-03-31'
);

-- ─────────────────────────────────────────────────────────────
-- Seed match_results
-- Scores reflect the matching engine logic:
--   Pass  = 0 failed checks
--   Close = 1-2 failed checks
--   Fail  = 3+ failed checks
-- Only active listings (LST-001, LST-002, LST-003) and
-- eligible applicants (status new/reviewing/active) are included.
-- ─────────────────────────────────────────────────────────────
INSERT INTO match_results (listing_id, email, full_name, status, failed_fields, scored_at)
VALUES
  -- ── LST-001: Sage Canyon (80-120% AMI, HH 2-5, credit 660+) ──
  ('LST-001', 'david.park@gmail.com',        'David Park',       'Pass',  '', NOW()),
  ('LST-001', 'sofia.reyes@outlook.com',     'Sofia Reyes',      'Pass',  '', NOW()),
  ('LST-001', 'maria.gonzalez@email.com',    'Maria Gonzalez',   'Close', 'Income too high ($120,000, max $92,000)', NOW()),
  ('LST-001', 'jwhitfield@gmail.com',        'James Whitfield',  'Close', 'Income too high ($88,000, max $82,000)', NOW()),
  ('LST-001', 'aisha.patel@outlook.com',     'Aisha Patel',      'Close', 'Income too high ($133,000, max $102,000)', NOW()),
  ('LST-001', 'linda.tran@protonmail.com',   'Linda Tran',       'Close', 'Income too high ($144,000, max $110,000)', NOW()),

  -- ── LST-002: Ironwood Commons (60-80% AMI, HH 2-4, credit 640+) ──
  ('LST-002', 'david.park@gmail.com',        'David Park',       'Pass',  '', NOW()),
  ('LST-002', 'sofia.reyes@outlook.com',     'Sofia Reyes',      'Close', 'Income too high ($75,000, max $74,000)', NOW()),
  ('LST-002', 'maria.gonzalez@email.com',    'Maria Gonzalez',   'Close', 'Income too high ($120,000, max $74,000)', NOW()),
  ('LST-002', 'jwhitfield@gmail.com',        'James Whitfield',  'Close', 'Income too high ($88,000, max $66,000)', NOW()),
  ('LST-002', 'aisha.patel@outlook.com',     'Aisha Patel',      'Close', 'Income too high ($133,000, max $82,000)', NOW()),
  ('LST-002', 'linda.tran@protonmail.com',   'Linda Tran',       'Close', 'Household size too large (5, max 4)', NOW()),

  -- ── LST-003: Bayside Row (80% AMI, HH 1-3, credit 680+) ──
  ('LST-003', 'david.park@gmail.com',        'David Park',       'Pass',  '', NOW()),
  ('LST-003', 'sofia.reyes@outlook.com',     'Sofia Reyes',      'Pass',  '', NOW()),
  ('LST-003', 'maria.gonzalez@email.com',    'Maria Gonzalez',   'Close', 'Income too high ($120,000, max $83,000)', NOW()),
  ('LST-003', 'jwhitfield@gmail.com',        'James Whitfield',  'Close', 'Income too high ($88,000, max $74,000)', NOW()),
  ('LST-003', 'aisha.patel@outlook.com',     'Aisha Patel',      'Close', 'Household size too large (4, max 3)', NOW()),
  ('LST-003', 'linda.tran@protonmail.com',   'Linda Tran',       'Close', 'Household size too large (5, max 3)', NOW())

ON CONFLICT (listing_id, email) DO UPDATE SET
  full_name     = EXCLUDED.full_name,
  status        = EXCLUDED.status,
  failed_fields = EXCLUDED.failed_fields,
  scored_at     = EXCLUDED.scored_at;
