-- =============================================================
-- 013 — Add emp_N_salaried columns to interest_list
-- Run this in the Supabase SQL Editor.
--
-- Phase 16 split the employment income question into two:
--   (1) Income type: W-2 / 1099  → stored in existing emp_N_income_type
--   (2) Annual Salary? Yes / No  → NEW field emp_N_salaried
-- Without these columns the salaried/hourly choice is dropped on submit.
-- =============================================================

ALTER TABLE interest_list
  ADD COLUMN IF NOT EXISTS emp_1_salaried TEXT,
  ADD COLUMN IF NOT EXISTS emp_2_salaried TEXT,
  ADD COLUMN IF NOT EXISTS emp_3_salaried TEXT,
  ADD COLUMN IF NOT EXISTS emp_4_salaried TEXT;
