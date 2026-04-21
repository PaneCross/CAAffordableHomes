-- =============================================================
-- 009 — Program Auto-Sync
-- Run this in the Supabase SQL Editor.
-- Adds zip_code to listings, household_size to programs, and
-- installs a trigger that keeps program aggregate fields in sync
-- with their linked active listings automatically.
-- =============================================================

-- ── 1. New columns ──────────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS min_household_size TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS max_household_size TEXT;
ALTER TABLE programs  ADD COLUMN IF NOT EXISTS household_size TEXT;

-- ── 2. Auto-sync function ────────────────────────────────────
-- Called by the trigger (and optionally by the admin "Sync Now"
-- button via RPC). Aggregates from ACTIVE listings linked to the
-- given community_name and writes the ranges back to programs.
-- Fields that yield no data (no active linked listings with
-- that value) are set to NULL, which tells the admin UI to
-- fall back to free-entry mode.

CREATE OR REPLACE FUNCTION sync_program_from_listings(p_community_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price_min  NUMERIC; v_price_max  NUMERIC;
  v_beds_min   INT;     v_beds_max   INT;
  v_ami_min    NUMERIC; v_ami_max    NUMERIC;
  v_hh_min     INT;     v_hh_max     INT;
  v_zips       TEXT;
BEGIN
  -- Aggregate scalars from active linked listings.
  -- Only cast columns that look like numbers to avoid errors on
  -- free-text entries.
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

  -- Distinct zip codes, sorted, comma-separated.
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

  -- Write calculated ranges back to the program row.
  -- If a field aggregates to NULL (no usable data), it is set to
  -- NULL so the admin UI knows to allow free-entry.
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
    zip_code = v_zips,       -- NULL if no zips found
    household_size = CASE
      WHEN v_hh_min IS NULL                     THEN NULL
      WHEN v_hh_min = v_hh_max                  THEN v_hh_min::TEXT
      ELSE v_hh_min::TEXT || '-' || v_hh_max::TEXT
    END,
    updated_at = NOW()
  WHERE community_name = p_community_name;
END;
$$;

-- ── 3. Trigger function ──────────────────────────────────────
-- Fires after any INSERT / UPDATE / DELETE on listings.
-- Syncs the affected program (and the old one if the listing
-- was re-linked to a different program).

CREATE OR REPLACE FUNCTION trg_sync_program_on_listing_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.linked_program_id IS NOT NULL THEN
      PERFORM sync_program_from_listings(OLD.linked_program_id);
    END IF;
    RETURN OLD;
  END IF;

  -- Sync the program this listing is now linked to
  IF NEW.linked_program_id IS NOT NULL THEN
    PERFORM sync_program_from_listings(NEW.linked_program_id);
  END IF;

  -- If the listing was moved from one program to another,
  -- also sync the old program so it loses this listing's data
  IF TG_OP = 'UPDATE'
    AND OLD.linked_program_id IS NOT NULL
    AND OLD.linked_program_id IS DISTINCT FROM NEW.linked_program_id
  THEN
    PERFORM sync_program_from_listings(OLD.linked_program_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_listing_sync_program ON listings;
CREATE TRIGGER trg_listing_sync_program
AFTER INSERT OR UPDATE OR DELETE ON listings
FOR EACH ROW EXECUTE FUNCTION trg_sync_program_on_listing_change();

-- ── 5. Permissions ───────────────────────────────────────────
-- sync_program_from_listings is also callable as a Supabase RPC
-- from the admin portal ("Sync Now" button).
GRANT EXECUTE ON FUNCTION sync_program_from_listings(TEXT) TO authenticated;

-- ── 6. Back-fill existing programs ──────────────────────────
-- Run the sync once for every program that already has linked
-- listings so existing data is populated immediately.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT community_name FROM programs LOOP
    PERFORM sync_program_from_listings(r.community_name);
  END LOOP;
END;
$$;
