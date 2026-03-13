/* ==========================================================
   CA Affordable Homes — Apps Script
   ==========================================================

   SETUP INSTRUCTIONS (do this once):

   1. Open your Google Sheet
   2. Click Extensions → Apps Script
   3. Delete the default empty function
   4. Paste this entire file and click Save (disk icon)

   5. INTEREST LIST TAB — no manual setup needed:
      - The "Interest List" tab is created automatically on the first form submission.
      - Column headers are written by the script. Do not rename or reorder them.
      - Set status values manually: "new" (default) → "reviewing" → "matched" → "expired".

   6. REQUIREMENTS TAB — create manually before running matching:
      - Add a new tab named exactly: Requirements
      - Row 1 must have these exact column headers in this order:
        listing_id, listing_name, active, ami_percent,
        min_household_size, max_household_size,
        max_income_1person, max_income_2person, max_income_3person,
        max_income_4person, max_income_5person, max_income_6person,
        min_income, min_credit_score, max_dti_percent, max_monthly_debt,
        first_time_buyer_required, no_ownership_years,
        sd_county_residency_required, sd_residency_months,
        household_together_months, sdhc_prior_purchase_allowed,
        foreclosure_allowed, foreclosure_min_years,
        bankruptcy_allowed, bankruptcy_min_years,
        judgments_allowed, citizenship_required,
        permanent_resident_acceptable, min_assets, max_assets,
        min_down_payment_pct, max_down_payment_pct,
        min_employment_months, program_notes
      - Fill in only the fields that apply to each listing. Leave others blank.
      - Set "active" to YES for any listing you want included in matching.

   7. MATCH RESULTS TAB — created automatically on first match run.
      - Do not rename or delete it.
      - Columns: listing_id, listing_name, applicant_email, applicant_name,
                 applicant_phone, match_status (Pass/Close/Fail),
                 failed_fields, run_at

   8. DEPLOY / UPDATE:
      - If first time: Click Deploy → New deployment → Web App
        Execute as: Me | Who has access: Anyone → Deploy → Authorize
      - If updating: Click Deploy → Manage deployments → Edit (pencil icon)
        Set Version to "New version" → Deploy
        The Web App URL stays the same after first deployment.

   9. SET UP TRIGGERS (do this once in the Triggers panel):

      TRIGGER A — Re-run matching when Requirements sheet is edited:
      - In Apps Script editor, click the clock icon (Triggers) on the left sidebar
      - Click "+ Add Trigger" (bottom right)
      - Choose function: onRequirementsEdit
      - Event source: From spreadsheet
      - Event type: On edit
      - Click Save

      TRIGGER B — Run full matching every morning at 7 AM:
      - Click "+ Add Trigger" again
      - Choose function: runMatchingForAllListings
      - Event source: Time-driven
      - Time based trigger type: Day timer
      - Time of day: 6am to 7am
      - Click Save

   ========================================================== */

/* ── Configuration ── */
var SPREADSHEET_ID = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var LISTINGS_SHEET = 'Listings';
var SITE_URL       = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var SCRIPT_URL     = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';
var FROM_NAME      = 'CA Affordable Homes Team';
var REPLY_TO       = 'Info@CAAffordableHomes.com';

/* ── Matching configuration ── */
var REQUIREMENTS_SHEET  = 'Requirements';
var MATCH_RESULTS_SHEET = 'Match Results';
var CLOSE_THRESHOLD     = 2;  /* applicants with <= this many failed fields are "Close" */
var NOTIFY_EMAIL        = 'tj@nostos.tech'; /* switch to Kacee's address at Phase 8 launch */

/* ── Interest List sheet name ── */
var IL_SHEET = 'Interest List';

/* ── Interest List column order (must stay in sync with contact.html field names) ──
   Columns are created automatically on first doPost if the tab doesn't exist.
   Do NOT reorder — append new fields at the end to keep existing data aligned. */
var IL_COLUMNS = [
  /* System */
  'submitted_at', 'status', 'updated_at',
  /* Section I */
  'first_name', 'last_name', 'phone', 'email',
  'owned_real_estate', 'household_size',
  'lived_together_12mo', 'live_in_sd_county',
  'credit_score_range', 'monthly_rent',
  'rent_subsidized', 'rent_subsidy_amount',
  'worked_lived_sd_2yr', 'sdhc_prior_purchase',
  /* Section II — income members (up to 6) */
  'income_1_name', 'income_1_relationship', 'income_1_annual',
  'income_2_name', 'income_2_relationship', 'income_2_annual',
  'income_3_name', 'income_3_relationship', 'income_3_annual',
  'income_4_name', 'income_4_relationship', 'income_4_annual',
  'income_5_name', 'income_5_relationship', 'income_5_annual',
  'income_6_name', 'income_6_relationship', 'income_6_annual',
  /* Tax-year income */
  'income_2022_total', 'income_2022_sched_c',
  'income_2023_total', 'income_2023_sched_c',
  'income_2024_total', 'income_2024_sched_c',
  'income_2025_total', 'income_2025_sched_c',
  /* Non-taxable income */
  'non_taxable_income', 'non_taxable_who', 'non_taxable_source',
  'non_taxable_amount', 'non_taxable_end_date_yn', 'non_taxable_end_date',
  /* Section III — employment entries (up to 4) */
  'emp_1_name', 'emp_1_relationship', 'emp_1_employer', 'emp_1_status',
  'emp_1_end_date', 'emp_1_same_line', 'emp_1_start_date',
  'emp_1_breaks', 'emp_1_breaks_desc', 'emp_1_income_type',
  'emp_1_annual_salary', 'emp_1_hourly_rate', 'emp_1_hours_per_week',
  'emp_1_ytd_gross', 'emp_1_pay_period_end', 'emp_1_w2_2025',

  'emp_2_name', 'emp_2_relationship', 'emp_2_employer', 'emp_2_status',
  'emp_2_end_date', 'emp_2_same_line', 'emp_2_start_date',
  'emp_2_breaks', 'emp_2_breaks_desc', 'emp_2_income_type',
  'emp_2_annual_salary', 'emp_2_hourly_rate', 'emp_2_hours_per_week',
  'emp_2_ytd_gross', 'emp_2_pay_period_end', 'emp_2_w2_2025',

  'emp_3_name', 'emp_3_relationship', 'emp_3_employer', 'emp_3_status',
  'emp_3_end_date', 'emp_3_same_line', 'emp_3_start_date',
  'emp_3_breaks', 'emp_3_breaks_desc', 'emp_3_income_type',
  'emp_3_annual_salary', 'emp_3_hourly_rate', 'emp_3_hours_per_week',
  'emp_3_ytd_gross', 'emp_3_pay_period_end', 'emp_3_w2_2025',

  'emp_4_name', 'emp_4_relationship', 'emp_4_employer', 'emp_4_status',
  'emp_4_end_date', 'emp_4_same_line', 'emp_4_start_date',
  'emp_4_breaks', 'emp_4_breaks_desc', 'emp_4_income_type',
  'emp_4_annual_salary', 'emp_4_hourly_rate', 'emp_4_hours_per_week',
  'emp_4_ytd_gross', 'emp_4_pay_period_end', 'emp_4_w2_2025',
  /* Section IV — Financial & Disclosures */
  'monthly_debt_payments',
  'foreclosure', 'foreclosure_date',
  'bankruptcy', 'bankruptcy_discharge_date',
  'judgments', 'judgments_description',
  'us_citizen', 'permanent_resident',
  'asset_checking', 'asset_savings', 'asset_401k', 'asset_other',
  'loan_signers', 'household_members', 'additional_info',
  'listing_interest_summary'
];

/* Build a field-name → 1-based column-number lookup at load time */
var IL_COL = (function () {
  var map = {};
  for (var i = 0; i < IL_COLUMNS.length; i++) map[IL_COLUMNS[i]] = i + 1;
  return map;
}());

/* ── Requirements sheet columns ──
   One row per listing. All fields optional except listing_id and active.
   Leave a cell blank to skip that check for this listing. */
var REQ_COLUMNS = [
  'listing_id',                    /* A — must match Property Name in Listings tab */
  'listing_name',                  /* B — display name used in emails */
  'active',                        /* C — YES to include in daily matching */
  'ami_percent',                   /* D — e.g. "80%" — reference only */
  'min_household_size',            /* E */
  'max_household_size',            /* F */
  'max_income_1person',            /* G */
  'max_income_2person',            /* H */
  'max_income_3person',            /* I */
  'max_income_4person',            /* J */
  'max_income_5person',            /* K */
  'max_income_6person',            /* L */
  'min_income',                    /* M */
  'min_credit_score',              /* N — default 640 */
  'max_dti_percent',               /* O — default 45 */
  'max_monthly_debt',              /* P */
  'first_time_buyer_required',     /* Q — YES/NO */
  'no_ownership_years',            /* R — default 3 */
  'sd_county_residency_required',  /* S — YES/NO */
  'sd_residency_months',           /* T — default 24 */
  'household_together_months',     /* U — default 12 */
  'sdhc_prior_purchase_allowed',   /* V — YES/NO */
  'foreclosure_allowed',           /* W — YES/NO */
  'foreclosure_min_years',         /* X */
  'bankruptcy_allowed',            /* Y — YES/NO */
  'bankruptcy_min_years',          /* Z */
  'judgments_allowed',             /* AA — YES/NO */
  'citizenship_required',          /* AB — YES/NO */
  'permanent_resident_acceptable', /* AC — YES/NO */
  'min_assets',                    /* AD */
  'max_assets',                    /* AE */
  'min_down_payment_pct',          /* AF */
  'max_down_payment_pct',          /* AG */
  'min_employment_months',         /* AH */
  'program_notes'                  /* AI — reference only, not used in matching */
];

var REQ_COL = (function () {
  var map = {};
  for (var i = 0; i < REQ_COLUMNS.length; i++) map[REQ_COLUMNS[i]] = i + 1;
  return map;
}());

/* ── Match Results sheet columns ── */
var MR_COLUMNS = [
  'listing_id', 'listing_name', 'applicant_email', 'applicant_name',
  'applicant_phone', 'match_status', 'failed_fields', 'run_at'
];

/* ==========================================================
   doPost — routes by form_type:
     "interest_list" (default) — Interest List questionnaire
     "mls_contact"             — MLS property inquiry from homes.html modal
   ========================================================== */
function doPost(e) {
  try {
    var data     = JSON.parse(e.postData.contents);
    var formType = (data.form_type || 'interest_list').trim().toLowerCase();

    if (formType === 'mls_contact') {
      return handleMLSContact(data);
    }

    /* ── Interest List flow ── */
    var email = (data.email || '').trim().toLowerCase();
    if (!email) {
      return jsonResponse({ ok: false, error: 'Email is required' });
    }

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(IL_SHEET);

    /* Auto-create the Interest List tab with headers on first submission */
    if (!sheet) {
      sheet = ss.insertSheet(IL_SHEET);
      sheet.getRange(1, 1, 1, IL_COLUMNS.length).setValues([IL_COLUMNS]);
      sheet.setFrozenRows(1);
    }

    var now     = new Date();
    var row     = buildILRow(data, now, 'new');
    var updated = false;

    /* Deduplication: find existing active row with same email */
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var emailVals = sheet.getRange(2, IL_COL['email'], lastRow - 1, 1).getValues();
      for (var i = 0; i < emailVals.length; i++) {
        var existingEmail = (emailVals[i][0] || '').toString().trim().toLowerCase();
        if (existingEmail === email) {
          var existingStatus = sheet.getRange(i + 2, IL_COL['status']).getValue();
          if (existingStatus !== 'expired') {
            row[IL_COL['submitted_at'] - 1] = sheet.getRange(i + 2, IL_COL['submitted_at']).getValue();
            row[IL_COL['status']       - 1] = existingStatus;
            row[IL_COL['updated_at']   - 1] = now;
            sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
            updated = true;
            break;
          }
        }
      }
    }

    if (!updated) {
      sheet.appendRow(row);
    }

    sendILConfirmation(data);
    sendILNotification(data, updated);

    return jsonResponse({ ok: true });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ ok: false, error: err.message });
  }
}

/* ==========================================================
   handleMLSContact — MLS property inquiry from homes.html modal
   ========================================================== */
function handleMLSContact(data) {
  var propName = (data.property_name || 'Unknown Property').trim();
  var name     = (data.name    || '').trim();
  var email    = (data.email   || '').trim();
  var phone    = (data.phone   || '').trim();
  var message  = (data.message || '').trim();

  if (!email) {
    return jsonResponse({ ok: false, error: 'Email is required' });
  }

  var subject = '[MLS Inquiry] ' + propName + ' \u2014 ' + (name || 'Anonymous') + ' <' + email + '>';
  var body =
    'MLS Property Inquiry\n\n'
    + 'Property: ' + propName + '\n'
    + '---\n'
    + 'Name:    ' + name  + '\n'
    + 'Email:   ' + email + '\n'
    + 'Phone:   ' + (phone || '(not provided)') + '\n'
    + '---\n'
    + 'Message:\n' + (message || '(no message provided)') + '\n\n'
    + 'Reply directly to: ' + email;

  try {
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: subject,
      body:    body,
      name:    FROM_NAME,
      replyTo: email
    });
    Logger.log('MLS inquiry sent for: ' + propName + ' from ' + email);
  } catch (err) {
    Logger.log('MLS inquiry email failed: ' + err.message);
  }

  return jsonResponse({ ok: true });
}

/* ── Build a flat array aligned to IL_COLUMNS for one submission ── */
function buildILRow(data, now, status) {
  var row = new Array(IL_COLUMNS.length).fill('');
  row[IL_COL['submitted_at'] - 1] = now;
  row[IL_COL['status']       - 1] = status || 'new';
  row[IL_COL['updated_at']   - 1] = now;

  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && IL_COL[key] !== undefined) {
      row[IL_COL[key] - 1] = data[key];
    }
  }
  return row;
}

/* ── Applicant confirmation email ── */
function sendILConfirmation(data) {
  var toEmail   = (data.email      || '').trim();
  var firstName = (data.first_name || '').trim();
  if (!toEmail) return;

  var greeting = firstName ? 'Hi ' + firstName + ',' : 'Hi there,';
  var subject  = 'You\u2019re on the Interest List \u2014 CA Affordable Homes';

  var body =
    greeting + '\n\n'
    + 'Thank you for completing the CA Affordable Homes Interest List questionnaire.\n\n'
    + 'You\u2019re officially on our Interest List. Here\u2019s what happens next:\n\n'
    + '1. We review your profile and compare it to our current and upcoming listings.\n'
    + '2. When a listing may be a good match, we\u2019ll reach out directly to walk you through next steps.\n'
    + '3. You don\u2019t need to do anything right now \u2014 we\u2019ll contact you.\n\n'
    + 'Need to update your information? Email us at Info@CAAffordableHomes.com with your name and the changes.\n\n'
    + 'Thank you for trusting CA Affordable Homes.\n\n'
    + '\u2014 ' + FROM_NAME + '\n'
    + 'We are not a lender. This acknowledgment is informational only.';

  var htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">'
    + '<div style="background:#818b7e;padding:22px 32px;">'
    +   '<p style="color:#fff;margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CA Affordable Homes</p>'
    +   '<h1 style="color:#fff;margin:6px 0 0;font-size:22px;font-weight:600;">&#10003;&nbsp; You\'re on the Interest List</h1>'
    + '</div>'
    + '<div style="padding:32px;">'
    +   '<p style="color:#333;margin-top:0;">' + greeting + '</p>'
    +   '<p style="color:#333;">Thank you for completing the CA Affordable Homes Interest List questionnaire. You\'re officially on our list.</p>'
    +   '<div style="background:#f7f7f4;border-left:4px solid #818b7e;padding:18px 22px;margin:22px 0;border-radius:4px;">'
    +     '<p style="margin:0 0 10px;font-weight:600;color:#222;">What happens next:</p>'
    +     '<ol style="margin:0;padding-left:1.25rem;color:#444;line-height:1.8;">'
    +       '<li>We review your profile and compare it to current and upcoming listings.</li>'
    +       '<li>When a listing may be a good match, we\'ll reach out directly.</li>'
    +       '<li>You don\'t need to do anything right now &mdash; we\'ll contact you.</li>'
    +     '</ol>'
    +   '</div>'
    +   '<p style="color:#555;font-size:14px;">'
    +     'Need to update your information? Email us any time at '
    +     '<a href="mailto:Info@CAAffordableHomes.com" style="color:#818b7e;">Info@CAAffordableHomes.com</a>.'
    +   '</p>'
    +   '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">'
    +   '<p style="color:#999;font-size:12px;margin:0;">'
    +     'CA Affordable Homes &bull; '
    +     '<a href="' + SITE_URL + '" style="color:#999;">caaffordablehomes.com</a><br>'
    +     'We are not a lender. This acknowledgment is informational only.'
    +   '</p>'
    + '</div>'
    + '</div>';

  try {
    MailApp.sendEmail({
      to:       toEmail,
      subject:  subject,
      body:     body,
      htmlBody: htmlBody,
      name:     FROM_NAME,
      replyTo:  REPLY_TO
    });
    Logger.log('IL confirmation sent to: ' + toEmail);
  } catch (err) {
    Logger.log('IL confirmation failed for ' + toEmail + ': ' + err.message);
  }
}

/* ── Internal notification email to the team ── */
function sendILNotification(data, updated) {
  var fullName = ((data.first_name || '') + ' ' + (data.last_name || '')).trim();
  var subject  = (updated ? '[UPDATED] ' : '[NEW] ')
    + 'Interest List: ' + fullName + ' <' + (data.email || '') + '>';

  var body =
    'Interest List submission received.\n\n'
    + 'Action:             ' + (updated ? 'UPDATED (returning applicant)' : 'NEW') + '\n'
    + '---\n'
    + 'Name:               ' + fullName + '\n'
    + 'Email:              ' + (data.email || '') + '\n'
    + 'Phone:              ' + (data.phone || '') + '\n'
    + '---\n'
    + 'Household size:     ' + (data.household_size || '') + '\n'
    + 'Credit score:       ' + (data.credit_score_range || '') + '\n'
    + 'Monthly rent:       $' + (data.monthly_rent || '0') + '\n'
    + 'Monthly debt:       $' + (data.monthly_debt_payments || '0') + '\n'
    + '---\n'
    + '2023 income:        $' + (data.income_2023_total || '0') + '\n'
    + '2024 income:        $' + (data.income_2024_total || '0') + '\n'
    + '2025 income:        $' + (data.income_2025_total || '') + '\n'
    + '---\n'
    + 'Checking assets:    $' + (data.asset_checking || '0') + '\n'
    + 'Savings assets:     $' + (data.asset_savings || '0') + '\n'
    + '---\n'
    + 'Foreclosure:        ' + (data.foreclosure || 'No') + '\n'
    + 'Bankruptcy:         ' + (data.bankruptcy || 'No') + '\n'
    + 'Judgments:          ' + (data.judgments || 'No') + '\n'
    + '---\n'
    + 'Owned real estate:  ' + (data.owned_real_estate || '') + '\n'
    + 'SD resident 2yr:    ' + (data.worked_lived_sd_2yr || '') + '\n'
    + 'SDHC prior purchase:' + (data.sdhc_prior_purchase || '') + '\n'
    + '---\n'
    + 'Listing interest:   ' + (data.listing_interest_summary || '(none selected)') + '\n\n'
    + 'Full submission in Google Sheets:\n'
    + 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit#gid=0';

  try {
    MailApp.sendEmail({
      to:      NOTIFY_EMAIL,
      subject: subject,
      body:    body,
      name:    FROM_NAME,
      replyTo: REPLY_TO
    });
    Logger.log('IL notification sent to ' + NOTIFY_EMAIL);
  } catch (err) {
    Logger.log('IL notification failed: ' + err.message);
  }
}

/* ── Shared JSON response helper ── */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================
   MATCHING ENGINE
   ========================================================== */

/* ==========================================================
   runMatchingForAllListings
   Main entry point — called by the daily 7 AM time trigger
   or manually from the Apps Script editor (Run button).
   ========================================================== */
function runMatchingForAllListings() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var reqSheet = ss.getSheetByName(REQUIREMENTS_SHEET);
  if (!reqSheet) {
    Logger.log('Requirements sheet not found. Create it and add headers first (see setup step 6).');
    return;
  }

  var ilSheet = ss.getSheetByName(IL_SHEET);
  if (!ilSheet || ilSheet.getLastRow() < 2) {
    Logger.log('No applicants in Interest List yet.');
    return;
  }

  var applicants = getActiveApplicants(ilSheet);
  if (applicants.length === 0) {
    Logger.log('No active applicants found (status must be new, reviewing, or active).');
    return;
  }

  var reqLastRow = reqSheet.getLastRow();
  if (reqLastRow < 2) {
    Logger.log('No requirement rows found in Requirements sheet.');
    return;
  }

  var reqData           = reqSheet.getRange(2, 1, reqLastRow - 1, REQ_COLUMNS.length).getValues();
  var listingsProcessed = 0;

  for (var i = 0; i < reqData.length; i++) {
    var req    = rowToReqObj(reqData[i]);
    var active = (req['active'] || '').toString().trim().toLowerCase();
    if (active !== 'yes') continue;

    var results = matchApplicantsToListing(req, applicants);
    writeMatchResults(ss, results);

    var passes = results.filter(function (r) { return r.match_status === 'Pass'; });
    var closes = results.filter(function (r) { return r.match_status === 'Close'; });
    if (passes.length > 0 || closes.length > 0) {
      sendMatchEmail(req['listing_name'] || req['listing_id'], passes, closes);
    }

    listingsProcessed++;
  }

  Logger.log('Matching complete. Listings: ' + listingsProcessed + ' | Applicants: ' + applicants.length);
}

/* ==========================================================
   onRequirementsEdit — installable onEdit trigger
   Re-runs matching only for the listing row that was edited.
   Set up via Triggers panel (see setup step 9 / Trigger A).
   ========================================================== */
function onRequirementsEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== REQUIREMENTS_SHEET) return;

  var row = e.range.getRow();
  if (row === 1) return;

  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reqSheet = ss.getSheetByName(REQUIREMENTS_SHEET);
  var rowData  = reqSheet.getRange(row, 1, 1, REQ_COLUMNS.length).getValues()[0];
  var req      = rowToReqObj(rowData);

  var active = (req['active'] || '').toString().trim().toLowerCase();
  if (active !== 'yes') return;

  var ilSheet = ss.getSheetByName(IL_SHEET);
  if (!ilSheet || ilSheet.getLastRow() < 2) return;

  var applicants = getActiveApplicants(ilSheet);
  if (applicants.length === 0) return;

  var results = matchApplicantsToListing(req, applicants);
  writeMatchResults(ss, results);

  var passes = results.filter(function (r) { return r.match_status === 'Pass'; });
  var closes = results.filter(function (r) { return r.match_status === 'Close'; });
  if (passes.length > 0 || closes.length > 0) {
    sendMatchEmail(req['listing_name'] || req['listing_id'], passes, closes);
  }

  Logger.log('Re-match on edit: ' + req['listing_id'] + ' | Pass: ' + passes.length + ' | Close: ' + closes.length);
}

/* ── Returns all Interest List rows with a non-expired, non-matched status ── */
function getActiveApplicants(ilSheet) {
  var lastRow = ilSheet.getLastRow();
  if (lastRow < 2) return [];

  var data       = ilSheet.getRange(2, 1, lastRow - 1, IL_COLUMNS.length).getValues();
  var applicants = [];

  for (var i = 0; i < data.length; i++) {
    var obj    = rowToILObj(data[i]);
    var status = (obj['status'] || '').toString().trim().toLowerCase();
    if (status !== 'expired' && status !== 'matched') {
      applicants.push(obj);
    }
  }
  return applicants;
}

/* ── Run matching for one listing against all applicants ── */
function matchApplicantsToListing(req, applicants) {
  var results = [];
  var now     = new Date();

  for (var j = 0; j < applicants.length; j++) {
    var ap     = applicants[j];
    var result = evaluateApplicant(ap, req);
    results.push({
      listing_id:      req['listing_id'],
      listing_name:    req['listing_name'],
      applicant_email: (ap['email'] || '').toString().trim(),
      applicant_name:  ((ap['first_name'] || '') + ' ' + (ap['last_name'] || '')).trim(),
      applicant_phone: (ap['phone'] || '').toString().trim(),
      match_status:    result.status,
      failed_fields:   result.failedFields.join('; '),
      run_at:          now
    });
  }
  return results;
}

/* ==========================================================
   evaluateApplicant
   Checks every non-blank requirement field against the
   applicant's Interest List data.
   Returns { status: 'Pass'|'Close'|'Fail', failedFields: [] }
   ========================================================== */
function evaluateApplicant(ap, req) {
  var failed = [];

  /* 1 — Credit score (default minimum: 640) */
  var minCredit = parseNum(req['min_credit_score'], 640);
  var apCredit  = parseCreditScoreLowerBound(ap['credit_score_range']);
  if (apCredit !== null && apCredit < minCredit) {
    failed.push('Credit score (' + ap['credit_score_range'] + ', need ' + minCredit + '+)');
  }

  /* 2 — First-time buyer / no prior ownership */
  if (yesNo(req['first_time_buyer_required'], 'yes')) {
    if (yesNo(ap['owned_real_estate'])) {
      failed.push('Owned real estate in last ' + parseNum(req['no_ownership_years'], 3) + ' years');
    }
  }

  /* 3 — Household size */
  var hhSize = parseNum(ap['household_size']);
  var minHH  = parseNum(req['min_household_size']);
  var maxHH  = parseNum(req['max_household_size']);
  if (hhSize !== null) {
    if (minHH !== null && hhSize < minHH) {
      failed.push('Household size too small (' + hhSize + ', min ' + minHH + ')');
    }
    if (maxHH !== null && hhSize > maxHH) {
      failed.push('Household size too large (' + hhSize + ', max ' + maxHH + ')');
    }
  }

  /* 4 — Annual income */
  var annualIncome = getApplicantIncome(ap);
  if (annualIncome !== null && hhSize !== null) {
    var sizeKey = 'max_income_' + Math.min(Math.max(Math.round(hhSize), 1), 6) + 'person';
    var maxInc  = parseNum(req[sizeKey]);
    var minInc  = parseNum(req['min_income']);
    if (maxInc !== null && annualIncome > maxInc) {
      failed.push('Income too high ($' + fmt(annualIncome) + ', max $' + fmt(maxInc) + ')');
    }
    if (minInc !== null && annualIncome < minInc) {
      failed.push('Income too low ($' + fmt(annualIncome) + ', min $' + fmt(minInc) + ')');
    }
  }

  /* 5 — Monthly debt and DTI (default max DTI: 45%) */
  var monthlyDebt = parseNum(ap['monthly_debt_payments']);
  if (monthlyDebt !== null) {
    var maxDebt = parseNum(req['max_monthly_debt']);
    if (maxDebt !== null && monthlyDebt > maxDebt) {
      failed.push('Monthly debt too high ($' + fmt(monthlyDebt) + '/mo, max $' + fmt(maxDebt) + ')');
    }
    var maxDTI = parseNum(req['max_dti_percent'], 45);
    if (maxDTI !== null && annualIncome !== null && annualIncome > 0) {
      var dti = (monthlyDebt / (annualIncome / 12)) * 100;
      if (dti > maxDTI) {
        failed.push('DTI too high (' + Math.round(dti) + '%, max ' + maxDTI + '%)');
      }
    }
  }

  /* 6 — SD County residency (default: 24 months required) */
  if (yesNo(req['sd_county_residency_required'], 'yes')) {
    var sdMonths = parseNum(req['sd_residency_months'], 24);
    if (sdMonths >= 24) {
      if (!yesNo(ap['worked_lived_sd_2yr'])) {
        failed.push('SD County 2-year residency/work requirement not met');
      }
    } else {
      if (!yesNo(ap['live_in_sd_county'])) {
        failed.push('SD County residency required');
      }
    }
  }

  /* 7 — Household members living together (default: 12 months) */
  if (parseNum(req['household_together_months'], 12) >= 12) {
    if (!yesNo(ap['lived_together_12mo'])) {
      failed.push('Household not living together 12+ months');
    }
  }

  /* 8 — SDHC prior purchase */
  if (!yesNo(req['sdhc_prior_purchase_allowed'], 'yes') && yesNo(ap['sdhc_prior_purchase'])) {
    failed.push('Prior SDHC affordable program participation');
  }

  /* 9 — Foreclosure / short sale */
  if (yesNo(ap['foreclosure'])) {
    if (!yesNo(req['foreclosure_allowed'], 'yes')) {
      failed.push('Prior foreclosure/short sale (not allowed by this program)');
    } else {
      var fcMinYrs = parseNum(req['foreclosure_min_years']);
      if (fcMinYrs !== null) {
        var fcYrs = yearsSinceValue(ap['foreclosure_date']);
        if (fcYrs !== null && fcYrs < fcMinYrs) {
          failed.push('Foreclosure too recent (' + Math.floor(fcYrs) + ' yrs ago, need ' + fcMinYrs + '+)');
        }
      }
    }
  }

  /* 10 — Bankruptcy */
  if (yesNo(ap['bankruptcy'])) {
    if (!yesNo(req['bankruptcy_allowed'], 'yes')) {
      failed.push('Prior bankruptcy (not allowed by this program)');
    } else {
      var bkMinYrs = parseNum(req['bankruptcy_min_years']);
      if (bkMinYrs !== null) {
        var bkYrs = yearsSinceValue(ap['bankruptcy_discharge_date']);
        if (bkYrs !== null && bkYrs < bkMinYrs) {
          failed.push('Bankruptcy too recent (' + Math.floor(bkYrs) + ' yrs ago, need ' + bkMinYrs + '+)');
        }
      }
    }
  }

  /* 11 — Judgments */
  if (!yesNo(req['judgments_allowed'], 'yes') && yesNo(ap['judgments'])) {
    failed.push('Outstanding judgments/garnishments/liens');
  }

  /* 12 — Citizenship / permanent residency */
  if (yesNo(req['citizenship_required'], 'yes')) {
    var isCitizen = yesNo(ap['us_citizen']);
    var isPR      = yesNo(ap['permanent_resident']);
    var prOK      = yesNo(req['permanent_resident_acceptable'], 'yes');
    if (!isCitizen && !(prOK && isPR)) {
      failed.push('US citizenship or permanent residency required');
    }
  }

  /* 13 — Total assets */
  var totalAssets = getApplicantTotalAssets(ap);
  var minAssets   = parseNum(req['min_assets']);
  var maxAssets   = parseNum(req['max_assets']);
  if (totalAssets !== null) {
    if (minAssets !== null && totalAssets < minAssets) {
      failed.push('Assets too low ($' + fmt(totalAssets) + ', min $' + fmt(minAssets) + ')');
    }
    if (maxAssets !== null && totalAssets > maxAssets) {
      failed.push('Assets too high ($' + fmt(totalAssets) + ', max $' + fmt(maxAssets) + ')');
    }
  }

  var status = failed.length === 0 ? 'Pass'
    : failed.length <= CLOSE_THRESHOLD ? 'Close'
    : 'Fail';

  return { status: status, failedFields: failed };
}

/* ==========================================================
   writeMatchResults
   Upserts match result rows into the Match Results tab.
   Key = listing_id + applicant_email. Overwrites on re-run.
   ========================================================== */
function writeMatchResults(ss, results) {
  if (!results || results.length === 0) return;

  var sheet = ss.getSheetByName(MATCH_RESULTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MATCH_RESULTS_SHEET);
    sheet.getRange(1, 1, 1, MR_COLUMNS.length).setValues([MR_COLUMNS]);
    sheet.setFrozenRows(1);
  }

  var lastRow     = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var existing = sheet.getRange(2, 1, lastRow - 1, MR_COLUMNS.length).getValues();
    for (var i = 0; i < existing.length; i++) {
      var key = (existing[i][0] || '').toString() + '|' + (existing[i][2] || '').toString().toLowerCase();
      existingMap[key] = i + 2;
    }
  }

  for (var j = 0; j < results.length; j++) {
    var r      = results[j];
    var rowKey = r.listing_id + '|' + (r.applicant_email || '').toLowerCase();
    var rowArr = [
      r.listing_id, r.listing_name, r.applicant_email, r.applicant_name,
      r.applicant_phone, r.match_status, r.failed_fields, r.run_at
    ];
    if (existingMap[rowKey]) {
      sheet.getRange(existingMap[rowKey], 1, 1, MR_COLUMNS.length).setValues([rowArr]);
    } else {
      sheet.appendRow(rowArr);
    }
  }
}

/* ==========================================================
   sendMatchEmail
   Sends a branded HTML summary of Pass + Close candidates
   to NOTIFY_EMAIL after each listing match run.
   ========================================================== */
function sendMatchEmail(listingName, passes, closes) {
  if (passes.length === 0 && closes.length === 0) return;

  var subject  = '[CA Affordable Homes] New candidates for ' + listingName;
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';

  var body = 'Matching results for: ' + listingName + '\n'
    + 'Run: ' + new Date().toLocaleString() + '\n\n';
  if (passes.length > 0) {
    body += '=== PASS (' + passes.length + ') ===\n';
    for (var pi = 0; pi < passes.length; pi++) {
      body += passes[pi].applicant_name + ' | ' + passes[pi].applicant_phone + ' | ' + passes[pi].applicant_email + '\n';
    }
    body += '\n';
  }
  if (closes.length > 0) {
    body += '=== CLOSE — ' + CLOSE_THRESHOLD + ' or fewer issues (' + closes.length + ') ===\n';
    for (var ci = 0; ci < closes.length; ci++) {
      body += closes[ci].applicant_name + ' | ' + closes[ci].applicant_phone + ' | ' + closes[ci].applicant_email + '\n';
      body += '  Issues: ' + closes[ci].failed_fields + '\n';
    }
    body += '\n';
  }
  body += 'Full results: ' + sheetUrl;

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">'
    + '<div style="background:#818b7e;padding:20px 28px;">'
    +   '<p style="color:#fff;margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CA Affordable Homes — Matching Engine</p>'
    +   '<h1 style="color:#fff;margin:6px 0 0;font-size:20px;font-weight:600;">New Candidates: ' + escapeHtml(listingName) + '</h1>'
    + '</div>'
    + '<div style="padding:28px;">';

  if (passes.length > 0) {
    html += '<h2 style="color:#2e7d50;font-size:16px;margin:0 0 12px;">&#10003; Pass (' + passes.length + ')</h2>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">'
      + '<tr style="background:#f0f7f3;">'
      + '<th style="padding:8px 10px;text-align:left;">Name</th>'
      + '<th style="padding:8px 10px;text-align:left;">Phone</th>'
      + '<th style="padding:8px 10px;text-align:left;">Email</th>'
      + '</tr>';
    for (var p2 = 0; p2 < passes.length; p2++) {
      html += '<tr style="border-bottom:1px solid #eee;">'
        + '<td style="padding:8px 10px;">' + escapeHtml(passes[p2].applicant_name) + '</td>'
        + '<td style="padding:8px 10px;">' + escapeHtml(passes[p2].applicant_phone) + '</td>'
        + '<td style="padding:8px 10px;">' + escapeHtml(passes[p2].applicant_email) + '</td>'
        + '</tr>';
    }
    html += '</table>';
  }

  if (closes.length > 0) {
    html += '<h2 style="color:#b07d2e;font-size:16px;margin:0 0 12px;">&#9888; Close &mdash; ' + CLOSE_THRESHOLD + ' or fewer issues (' + closes.length + ')</h2>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">'
      + '<tr style="background:#fdf8f0;">'
      + '<th style="padding:8px 10px;text-align:left;">Name</th>'
      + '<th style="padding:8px 10px;text-align:left;">Phone</th>'
      + '<th style="padding:8px 10px;text-align:left;">Email</th>'
      + '<th style="padding:8px 10px;text-align:left;">Issues</th>'
      + '</tr>';
    for (var c2 = 0; c2 < closes.length; c2++) {
      html += '<tr style="border-bottom:1px solid #eee;">'
        + '<td style="padding:8px 10px;">' + escapeHtml(closes[c2].applicant_name) + '</td>'
        + '<td style="padding:8px 10px;">' + escapeHtml(closes[c2].applicant_phone) + '</td>'
        + '<td style="padding:8px 10px;">' + escapeHtml(closes[c2].applicant_email) + '</td>'
        + '<td style="padding:8px 10px;color:#b07d2e;">' + escapeHtml(closes[c2].failed_fields) + '</td>'
        + '</tr>';
    }
    html += '</table>';
  }

  html += '<a href="' + sheetUrl + '" style="display:inline-block;background:#818b7e;color:#fff;'
    + 'padding:11px 24px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">'
    + 'Open Google Sheets &rarr;</a>'
    + '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">'
    + '<p style="color:#999;font-size:12px;margin:0;">CA Affordable Homes &bull; Automated matching engine</p>'
    + '</div></div>';

  try {
    MailApp.sendEmail({
      to:       NOTIFY_EMAIL,
      subject:  subject,
      body:     body,
      htmlBody: html,
      name:     FROM_NAME,
      replyTo:  REPLY_TO
    });
    Logger.log('Match email sent for: ' + listingName + ' | Pass: ' + passes.length + ' | Close: ' + closes.length);
  } catch (err) {
    Logger.log('Match email failed for ' + listingName + ': ' + err.message);
  }
}

/* ==========================================================
   testMatching — run this manually to test the matching engine
   In Apps Script editor: select testMatching → click Run
   ========================================================== */
function testMatching() {
  Logger.log('Starting test match run...');
  runMatchingForAllListings();
  Logger.log('Done. Check Match Results tab and your inbox.');
}

/* ── Utility functions ── */

function rowToReqObj(row) {
  var obj = {};
  for (var i = 0; i < REQ_COLUMNS.length; i++) {
    obj[REQ_COLUMNS[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
  }
  return obj;
}

function rowToILObj(row) {
  var obj = {};
  for (var i = 0; i < IL_COLUMNS.length; i++) {
    obj[IL_COLUMNS[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
  }
  return obj;
}

function parseNum(val, defaultVal) {
  if (val === '' || val === null || val === undefined) {
    return (defaultVal !== undefined) ? defaultVal : null;
  }
  var n = parseFloat(val.toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? (defaultVal !== undefined ? defaultVal : null) : n;
}

function yesNo(val, defaultStr) {
  var s = (val || '').toString().trim().toLowerCase();
  if (s === '') s = (defaultStr || 'no').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

function parseCreditScoreLowerBound(rangeStr) {
  if (!rangeStr) return null;
  var s = rangeStr.toString().trim().toLowerCase();
  if (s.indexOf('below') !== -1 || s.indexOf('under') !== -1) return 499;
  var match = s.match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : null;
}

function getApplicantIncome(ap) {
  var memberTotal   = 0;
  var hasMemberData = false;
  for (var i = 1; i <= 6; i++) {
    var amt = parseNum(ap['income_' + i + '_annual']);
    if (amt !== null && amt > 0) { memberTotal += amt; hasMemberData = true; }
  }
  if (hasMemberData) return memberTotal;
  var t2024 = parseNum(ap['income_2024_total']);
  if (t2024 !== null && t2024 > 0) return t2024;
  var t2023 = parseNum(ap['income_2023_total']);
  if (t2023 !== null && t2023 > 0) return t2023;
  return null;
}

function getApplicantTotalAssets(ap) {
  var fields = ['asset_checking', 'asset_savings', 'asset_401k', 'asset_other'];
  var total  = 0;
  var hasAny = false;
  for (var i = 0; i < fields.length; i++) {
    var v = parseNum(ap[fields[i]]);
    if (v !== null && v > 0) { total += v; hasAny = true; }
  }
  return hasAny ? total : null;
}

function yearsSinceValue(val) {
  if (!val) return null;
  var d = (val instanceof Date) ? val : new Date(val.toString());
  if (isNaN(d.getTime())) return null;
  return (new Date() - d) / (365.25 * 24 * 60 * 60 * 1000);
}

function fmt(n) {
  return Math.round(n).toLocaleString();
}

function escapeHtml(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
