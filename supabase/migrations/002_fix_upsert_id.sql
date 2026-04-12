-- Fix: inject all NOT NULL system fields into payload before jsonb_populate_record
-- so BIGSERIAL and DEFAULT values are never overridden by NULL from missing keys
CREATE OR REPLACE FUNCTION upsert_interest_list(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email       TEXT := LOWER(TRIM(payload->>'email'));
  v_existing    interest_list%ROWTYPE;
  v_now         TIMESTAMPTZ := NOW();
  v_clean       JSONB;
  v_result_type TEXT;
BEGIN
  SELECT * INTO v_existing FROM interest_list WHERE LOWER(email) = v_email;

  IF NOT FOUND THEN
    -- Inject system fields so jsonb_populate_record never sees NULL for NOT NULL columns
    v_clean := jsonb_build_object(
      'id',                   nextval('interest_list_id_seq'),
      'submitted_at',         v_now,
      'updated_at',           v_now,
      'original_signup_at',   v_now,
      'status',               'new',
      'renewal_reminder_sent', false
    ) || (payload - 'id' - 'submitted_at' - 'updated_at' - 'original_signup_at' - 'status' - 'renewal_reminder_sent');

    INSERT INTO interest_list
    SELECT * FROM jsonb_populate_record(NULL::interest_list, v_clean);
    v_result_type := 'new';

  ELSIF v_existing.status = 'expired' THEN
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
    'ok',        TRUE,
    'type',      v_result_type,
    'full_name', COALESCE(payload->>'full_name', ''),
    'email',     v_email
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_interest_list(JSONB) TO service_role;
