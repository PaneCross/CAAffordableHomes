-- =============================================================
-- 010 — Program Auto-Inactive
-- Run this in the Supabase SQL Editor.
-- Extends sync_program_from_listings (from 009) to automatically
-- set a program's status to 'Inactive' when every linked listing
-- has been deactivated (e.g. all units sold via match approvals).
-- =============================================================

CREATE OR REPLACE FUNCTION sync_program_from_listings(p_community_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price_min    NUMERIC; v_price_max    NUMERIC;
  v_beds_min     INT;     v_beds_max     INT;
  v_ami_min      NUMERIC; v_ami_max      NUMERIC;
  v_hh_min       INT;     v_hh_max       INT;
  v_zips         TEXT;
  v_total_linked INT;
  v_active_linked INT;
BEGIN
  -- ── Aggregate scalars from active linked listings ───────────
  SELECT
    MIN(CASE WHEN TRIM(price)              ~ '^[0-9]+(\.[0-9]+)?$'
             THEN TRIM(price)::NUMERIC     END),
    MAX(CASE WHEN TRIM(price)              ~ '^[0-9]+(\.[0-9]+)?$'
             THEN TRIM(price)::NUMERIC     END),
    MIN(CASE WHEN TRIM(bedrooms)           ~ '^[0-9]+$'
             THEN TRIM(bedrooms)::INT      END),
    MAX(CASE WHEN TRIM(bedrooms)           ~ '^[0-9]+$'
             THEN TRIM(bedrooms)::INT      END),
    MIN(CASE WHEN TRIM(ami_percent)        ~ '^[0-9]+(\.[0-9]+)?$'
             THEN TRIM(ami_percent)::NUMERIC END),
    MAX(CASE WHEN TRIM(ami_percent)        ~ '^[0-9]+(\.[0-9]+)?$'
             THEN TRIM(ami_percent)::NUMERIC END),
    MIN(CASE WHEN TRIM(min_household_size) ~ '^[0-9]+$'
             THEN TRIM(min_household_size)::INT END),
    MAX(CASE WHEN TRIM(max_household_size) ~ '^[0-9]+$'
             THEN TRIM(max_household_size)::INT END)
  INTO
    v_price_min, v_price_max,
    v_beds_min,  v_beds_max,
    v_ami_min,   v_ami_max,
    v_hh_min,    v_hh_max
  FROM listings
  WHERE linked_program_id = p_community_name
    AND active             = 'YES';

  -- ── Distinct zip codes, sorted, comma-separated ─────────────
  SELECT STRING_AGG(zip, ', ' ORDER BY zip)
  INTO v_zips
  FROM (
    SELECT DISTINCT TRIM(zip_code) AS zip
    FROM listings
    WHERE linked_program_id = p_community_name
      AND active             = 'YES'
      AND zip_code IS NOT NULL
      AND TRIM(zip_code)    <> ''
  ) z;

  -- ── Write aggregate ranges to program ───────────────────────
  UPDATE programs SET
    price_range = CASE
      WHEN v_price_min IS NULL                  THEN NULL
      WHEN v_price_min = v_price_max
        THEN '$' || TO_CHAR(v_price_min, 'FM999,999,999')
      ELSE '$' || TO_CHAR(v_price_min, 'FM999,999,999')
        || ' - $' || TO_CHAR(v_price_max, 'FM999,999,999')
    END,
    bedrooms = CASE
      WHEN v_beds_min IS NULL                   THEN NULL
      WHEN v_beds_min = v_beds_max              THEN v_beds_min::TEXT
      ELSE v_beds_min::TEXT || '-' || v_beds_max::TEXT
    END,
    ami_percent = CASE
      WHEN v_ami_min IS NULL                    THEN NULL
      WHEN v_ami_min = v_ami_max                THEN v_ami_min::TEXT
      ELSE v_ami_min::TEXT || '-' || v_ami_max::TEXT
    END,
    zip_code = v_zips,
    household_size = CASE
      WHEN v_hh_min IS NULL                     THEN NULL
      WHEN v_hh_min = v_hh_max                  THEN v_hh_min::TEXT
      ELSE v_hh_min::TEXT || '-' || v_hh_max::TEXT
    END,
    updated_at = NOW()
  WHERE community_name = p_community_name;

  -- ── Auto-inactivate when all linked listings are sold out ───
  -- Count total linked listings vs how many are still active.
  -- If the program has linked listings but none are active any
  -- more, every unit has been sold (or the last listing was
  -- deactivated) so the program should stop appearing on the
  -- website. Only 'Available' programs are auto-set to 'Inactive'
  -- — programs already 'Inactive' or 'Coming Soon' are left alone.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE active = 'YES')
  INTO v_total_linked, v_active_linked
  FROM listings
  WHERE linked_program_id = p_community_name;

  IF v_total_linked > 0 AND v_active_linked = 0 THEN
    UPDATE programs
    SET status     = 'Inactive',
        updated_at = NOW()
    WHERE community_name = p_community_name
      AND status          = 'Available';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_program_from_listings(TEXT) TO authenticated;
