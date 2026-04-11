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
      (The daily trigger also auto-rebuilds the Dashboard after matching runs.)

      TRIGGER C — Check expiry dates every morning at 8 AM:
      - Click "+ Add Trigger" again
      - Choose function: checkExpiryDates
      - Event source: Time-driven
      - Time based trigger type: Day timer
      - Time of day: 7am to 8am
      - Click Save
      (Sends 11-month renewal reminder emails and marks 12-month-old rows as expired.)

  10. DASHBOARD TAB — created automatically by the script:
      - In Apps Script editor, select rebuildDashboard → click Run (do this once manually)
      - After that it rebuilds automatically every morning after matching (Trigger B above)
      - The tab is read-only for Kacee — DO NOT edit it manually; it gets overwritten on each run
      - To protect it from accidental editing:
          Open the sheet → right-click the "Dashboard" tab → Protect sheet
          Set "Show a warning when editing this range" or restrict to yourself only

   ========================================================== */

/* ── Configuration ── */
var SPREADSHEET_ID = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var LISTINGS_SHEET  = 'Listings';  /* master tab — merges old Listings + Requirements */
var SITE_URL       = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var SCRIPT_URL     = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';
var FROM_NAME      = 'CA Affordable Homes Team';
var REPLY_TO       = 'Info@CAAffordableHomes.com';

/* ── Matching configuration ── */
/* LISTINGS_SHEET removed — matching engine now reads from LISTINGS_SHEET */
var MATCH_RESULTS_SHEET = 'Match Results';
var DASHBOARD_SHEET     = 'Dashboard';
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
  'full_name', 'phone', 'email',
  'owned_real_estate', 'household_size',
  'lived_together_12mo', 'live_in_sd_county',
  'credit_score_self', 'credit_score_coborrower', 'monthly_rent',
  'rent_subsidized', 'rent_subsidy_amount',
  'worked_lived_sd_2yr', 'sdhc_prior_purchase',
  /* Section II — income members (up to 6) */
  'income_1_name', 'income_1_relationship', 'income_1_annual',
  'income_2_name', 'income_2_relationship', 'income_2_annual',
  'income_3_name', 'income_3_relationship', 'income_3_annual',
  'income_4_name', 'income_4_relationship', 'income_4_annual',
  'income_5_name', 'income_5_relationship', 'income_5_annual',
  'income_6_name', 'income_6_relationship', 'income_6_annual',
  /* Tax-year income — positional (1 = most recent year, 3 = oldest shown) */
  'tax_year_labels',
  'tax_1_total', 'tax_1_sched_c',
  'tax_2_total', 'tax_2_sched_c',
  'tax_3_total', 'tax_3_sched_c',
  /* Non-taxable income (up to 3 entries) */
  'non_taxable_income',
  'nontax_1_who', 'nontax_1_source', 'nontax_1_amount', 'nontax_1_end_date_yn', 'nontax_1_end_date',
  'nontax_2_who', 'nontax_2_source', 'nontax_2_amount', 'nontax_2_end_date_yn', 'nontax_2_end_date',
  'nontax_3_who', 'nontax_3_source', 'nontax_3_amount', 'nontax_3_end_date_yn', 'nontax_3_end_date',
  /* Real estate agent */
  'agent_yn', 'agent_name', 'agent_email', 'agent_phone', 'agent_dre',
  /* Section III — employment entries (up to 4) */
  'emp_1_name', 'emp_1_relationship', 'emp_1_employer', 'emp_1_status',
  'emp_1_end_date', 'emp_1_same_line', 'emp_1_start_date',
  'emp_1_breaks', 'emp_1_breaks_desc', 'emp_1_income_type',
  'emp_1_annual_salary', 'emp_1_hourly_rate', 'emp_1_hours_per_week',
  'emp_1_ytd_gross', 'emp_1_pay_period_end', 'emp_1_w2_recent',

  'emp_2_name', 'emp_2_relationship', 'emp_2_employer', 'emp_2_status',
  'emp_2_end_date', 'emp_2_same_line', 'emp_2_start_date',
  'emp_2_breaks', 'emp_2_breaks_desc', 'emp_2_income_type',
  'emp_2_annual_salary', 'emp_2_hourly_rate', 'emp_2_hours_per_week',
  'emp_2_ytd_gross', 'emp_2_pay_period_end', 'emp_2_w2_recent',

  'emp_3_name', 'emp_3_relationship', 'emp_3_employer', 'emp_3_status',
  'emp_3_end_date', 'emp_3_same_line', 'emp_3_start_date',
  'emp_3_breaks', 'emp_3_breaks_desc', 'emp_3_income_type',
  'emp_3_annual_salary', 'emp_3_hourly_rate', 'emp_3_hours_per_week',
  'emp_3_ytd_gross', 'emp_3_pay_period_end', 'emp_3_w2_recent',

  'emp_4_name', 'emp_4_relationship', 'emp_4_employer', 'emp_4_status',
  'emp_4_end_date', 'emp_4_same_line', 'emp_4_start_date',
  'emp_4_breaks', 'emp_4_breaks_desc', 'emp_4_income_type',
  'emp_4_annual_salary', 'emp_4_hourly_rate', 'emp_4_hours_per_week',
  'emp_4_ytd_gross', 'emp_4_pay_period_end', 'emp_4_w2_recent',
  /* Section IV — Financial & Disclosures */
  'monthly_debt_payments',
  'foreclosure', 'foreclosure_date',
  'bankruptcy', 'bankruptcy_discharge_date',
  'judgments', 'judgments_description',
  'us_citizen', 'permanent_resident',
  'asset_checking', 'asset_savings', 'asset_401k', 'asset_other',
  'loan_signers', 'household_members', 'additional_info',
  'area_preference',
  /* Phase 7 — expiry lifecycle */
  'renewal_reminder_sent',
  /* Phase 9 — signup anniversary */
  'original_signup_at'
];

/* Build a field-name → 1-based column-number lookup at load time */
var IL_COL = (function () {
  var map = {};
  for (var i = 0; i < IL_COLUMNS.length; i++) map[IL_COLUMNS[i]] = i + 1;
  return map;
}());

/* ── Master Listings sheet columns ──
   First 35 columns are identical to the old Requirements tab — the matching
   engine depends on positional order so do NOT reorder these.
   New property-info columns are appended after (columns AF onward). */
var LISTINGS_COLUMNS = [
  /* ── Identification & matching toggle (A–C) ── */
  'listing_id',                    /* A — property name / unique key */
  'listing_name',                  /* B — display name used in emails */
  'active',                        /* C — YES to include in daily matching */
  /* ── Requirements: income & AMI (D–L) ── */
  'ami_percent',                   /* D */
  'min_household_size',            /* E */
  'max_household_size',            /* F */
  'max_income_1person',            /* G */
  'max_income_2person',            /* H */
  'max_income_3person',            /* I */
  'max_income_4person',            /* J */
  'max_income_5person',            /* K */
  'max_income_6person',            /* L */
  /* ── Requirements: credit & debt (M–P) ── */
  'min_income',                    /* M */
  'min_credit_score',              /* N — default 640 */
  'max_dti_percent',               /* O — default 45 */
  'max_monthly_debt',              /* P */
  /* ── Requirements: buyer eligibility (Q–U) ── */
  'first_time_buyer_required',     /* Q — YES/NO */
  'no_ownership_years',            /* R — default 3 */
  'sd_county_residency_required',  /* S — YES/NO */
  'sd_residency_months',           /* T — default 24 */
  'household_together_months',     /* U — default 12 */
  /* ── Requirements: history (V–AC) ── */
  'sdhc_prior_purchase_allowed',   /* V — YES/NO */
  'foreclosure_allowed',           /* W — YES/NO */
  'foreclosure_min_years',         /* X */
  'bankruptcy_allowed',            /* Y — YES/NO */
  'bankruptcy_min_years',          /* Z */
  'judgments_allowed',             /* AA — YES/NO */
  'citizenship_required',          /* AB — YES/NO */
  'permanent_resident_acceptable', /* AC — YES/NO */
  /* ── Requirements: assets & financing (AD–AH) ── */
  'min_assets',                    /* AD */
  'max_assets',                    /* AE */
  'min_down_payment_pct',          /* AF */
  'max_down_payment_pct',          /* AG */
  'min_employment_months',         /* AH */
  /* ── Requirements notes (AI) ── */
  'program_notes',                 /* AI */
  /* ── Property info (AJ onward — new columns) ── */
  'address',                       /* AJ */
  'city',                          /* AK */
  'price',                         /* AL */
  'bedrooms',                      /* AM */
  'bathrooms',                     /* AN */
  'sqft',                          /* AO */
  'listing_type',                  /* AP — 'affordable' or 'mls' */
  'program_type',                  /* AQ */
  'internal_notes'                 /* AR */
];

var LISTINGS_COL = (function () {
  var map = {};
  for (var i = 0; i < LISTINGS_COLUMNS.length; i++) map[LISTINGS_COLUMNS[i]] = i + 1;
  return map;
}());

/* ── Match Results sheet columns ── */
var MR_COLUMNS = [
  'listing_id', 'listing_name', 'applicant_email', 'applicant_name',
  'applicant_phone', 'match_status', 'failed_fields', 'run_at'
];

/* ==========================================================
   doGet — handles GET requests to the Web App URL
   No public data endpoints — listing data is internal only.
   ========================================================== */
function doGet(e) {
  return ContentService
    .createTextOutput('CA Affordable Homes — Apps Script (use POST for form submissions)')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ==========================================================
   doPost — handles Interest List questionnaire submissions
   ========================================================== */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    /* ── Route property submissions separately ── */
    if (data.form_type === 'property_submission') {
      return handlePropertySubmission(data);
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

    var now        = new Date();
    var row        = buildILRow(data, now, 'new');
    var updated    = false;
    var reEnrolled = false;

    /* Deduplication: find any existing row (active or expired) with same email */
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var emailVals = sheet.getRange(2, IL_COL['email'], lastRow - 1, 1).getValues();
      for (var i = 0; i < emailVals.length; i++) {
        var existingEmail = (emailVals[i][0] || '').toString().trim().toLowerCase();
        if (existingEmail === email) {
          var existingStatus = sheet.getRange(i + 2, IL_COL['status']).getValue();
          if ((existingStatus || '').toString().trim().toLowerCase() === 'expired') {
            /* Re-enrollment: reset clock, restore to active, clear reminder flag */
            /* original_signup_at is always preserved — it never resets */
            row[IL_COL['submitted_at']          - 1] = now;
            row[IL_COL['status']               - 1] = 'active';
            row[IL_COL['updated_at']           - 1] = now;
            row[IL_COL['renewal_reminder_sent'] - 1] = '';
            row[IL_COL['original_signup_at']    - 1] = sheet.getRange(i + 2, IL_COL['original_signup_at']).getValue();
            sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
            reEnrolled = true;
            updated    = true;
          } else {
            /* Regular update: preserve original submission date, status, reminder flag, and signup date */
            row[IL_COL['submitted_at']          - 1] = sheet.getRange(i + 2, IL_COL['submitted_at']).getValue();
            row[IL_COL['status']               - 1] = existingStatus;
            row[IL_COL['updated_at']           - 1] = now;
            row[IL_COL['renewal_reminder_sent'] - 1] = sheet.getRange(i + 2, IL_COL['renewal_reminder_sent']).getValue();
            row[IL_COL['original_signup_at']    - 1] = sheet.getRange(i + 2, IL_COL['original_signup_at']).getValue();
            sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
            updated = true;
          }
          break;
        }
      }
    }

    if (!updated) {
      sheet.appendRow(row);
    }

    sendILWelcomeEmail(data);
    sendILNotification(data, updated, reEnrolled);

    return jsonResponse({ ok: true });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ ok: false, error: err.message });
  }
}

/* ── Build a flat array aligned to IL_COLUMNS for one submission ── */
function buildILRow(data, now, status) {
  var row = new Array(IL_COLUMNS.length).fill('');
  row[IL_COL['submitted_at']       - 1] = now;
  row[IL_COL['status']             - 1] = status || 'new';
  row[IL_COL['updated_at']         - 1] = now;
  row[IL_COL['original_signup_at'] - 1] = now;  // default for new signups; overwritten on updates

  for (var key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && IL_COL[key] !== undefined) {
      row[IL_COL[key] - 1] = data[key];
    }
  }
  return row;
}

/* ── Applicant confirmation email (no specific listings selected) ── */
function sendILWelcomeEmail(data) {
  var toEmail   = (data.email     || '').trim();
  var fullName  = (data.full_name || '').trim();
  var firstName = fullName ? fullName.split(/\s+/)[0] : '';
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
function sendILNotification(data, updated, reEnrolled) {
  var fullName  = (data.full_name || '').trim();
  var prefix    = reEnrolled ? '[RE-ENROLLMENT] ' : (updated ? '[UPDATED] ' : '[NEW] ');
  var actionStr = reEnrolled ? 'RE-ENROLLMENT (previously expired — profile reset & reactivated)'
                : (updated   ? 'UPDATED (returning applicant)'
                             : 'NEW');
  var subject  = prefix + 'Interest List: ' + fullName + ' <' + (data.email || '') + '>';

  var body =
    'Interest List submission received.\n\n'
    + 'Action:             ' + actionStr + '\n'
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
    + 'Tax years:          ' + (data.tax_year_labels || '') + '\n'
    + 'Most recent income: $' + (data.tax_1_total || '0') + '\n'
    + 'Prior year income:  $' + (data.tax_2_total || '0') + '\n'
    + 'Oldest year income: $' + (data.tax_3_total || '0') + '\n'
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
    + 'Area preference:    ' + (data.area_preference || '(not specified)') + '\n\n'
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

/* ==========================================================
   checkExpiryDates
   Runs daily via Trigger C (7–8 AM). Scans all "active" rows
   in the Interest List:
   - 11 months old + no reminder sent → sends renewal warning email
   - 12+ months old → marks status = "expired"
   ========================================================== */
function checkExpiryDates() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(IL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;

  var now      = new Date();
  var eleven   = new Date(now); eleven.setMonth(eleven.getMonth() - 11);
  var twelve   = new Date(now); twelve.setMonth(twelve.getMonth() - 12);

  var lastRow  = sheet.getLastRow();
  var data     = sheet.getRange(2, 1, lastRow - 1, IL_COLUMNS.length).getValues();
  var warnings = 0;
  var expired  = 0;

  for (var i = 0; i < data.length; i++) {
    var rowStatus    = (data[i][IL_COL['status']               - 1] || '').toString().trim().toLowerCase();
    var submittedAt  =  data[i][IL_COL['submitted_at']          - 1];
    var reminderSent = (data[i][IL_COL['renewal_reminder_sent'] - 1] || '').toString().trim();
    var email        = (data[i][IL_COL['email']                 - 1] || '').toString().trim();
    var firstName    = ((data[i][IL_COL['full_name'] - 1] || '').toString().trim()).split(/\s+/)[0] || '';

    if (rowStatus !== 'active') continue;
    if (!submittedAt || !(submittedAt instanceof Date)) continue;

    /* 12-month expiry — must check before 11-month to avoid sending reminder to expired rows */
    if (submittedAt <= twelve) {
      sheet.getRange(i + 2, IL_COL['status']).setValue('expired');
      sheet.getRange(i + 2, IL_COL['updated_at']).setValue(now);
      Logger.log('Expired: ' + email + ' (submitted ' + submittedAt.toDateString() + ')');
      expired++;
      continue;
    }

    /* 11-month warning */
    if (submittedAt <= eleven && !reminderSent) {
      sendRenewalReminderEmail(email, firstName);
      sheet.getRange(i + 2, IL_COL['renewal_reminder_sent']).setValue('true');
      sheet.getRange(i + 2, IL_COL['updated_at']).setValue(now);
      Logger.log('Renewal reminder sent: ' + email);
      warnings++;
    }
  }

  Logger.log('checkExpiryDates complete. Warnings sent: ' + warnings + ' | Rows expired: ' + expired);
}

/* ── 11-month renewal warning email to applicant ── */
function sendRenewalReminderEmail(toEmail, firstName) {
  if (!toEmail) return;

  var greeting   = firstName ? 'Hi ' + firstName + ',' : 'Hi there,';
  var subject    = 'Your CA Affordable Homes profile is expiring soon';
  var contactUrl = 'https://caaffordablehomes.com/contact.html';

  var body =
    greeting + '\n\n'
    + 'It\u2019s been almost a year since you joined the CA Affordable Homes Interest List \u2014 thank you for your patience!\n\n'
    + 'To keep your profile active and ensure we\u2019re working with your most current information, '
    + 'we\u2019d love for you to re-submit the Interest List questionnaire. Circumstances change, '
    + 'and an updated profile helps us match you with the right listing when one becomes available.\n\n'
    + 'Re-submit here: ' + contactUrl + '\n\n'
    + 'Important: please use this same email address (' + toEmail + ') when re-submitting so we can update your existing profile. '
    + 'If you use a different email address, a new profile will be created and this one will expire automatically.\n\n'
    + 'If you no longer need assistance finding an affordable home, no action is needed \u2014 '
    + 'your profile will be automatically removed from our active list in 30 days.\n\n'
    + 'Questions? Reach us at Info@CAAffordableHomes.com\n\n'
    + '\u2014 ' + FROM_NAME + '\n'
    + 'We are not a lender. This is not an offer or guarantee of housing.';

  var htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">'
    + '<div style="background:#818b7e;padding:22px 32px;">'
    +   '<p style="color:#fff;margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CA Affordable Homes</p>'
    +   '<h1 style="color:#fff;margin:6px 0 0;font-size:21px;font-weight:600;">Your Profile Is Expiring Soon</h1>'
    + '</div>'
    + '<div style="padding:32px;">'
    +   '<p style="color:#333;margin-top:0;">' + escapeHtml(greeting) + '</p>'
    +   '<p style="color:#333;">It&rsquo;s been almost a year since you joined the CA Affordable Homes Interest List &mdash; thank you for your patience!</p>'
    +   '<div style="background:#f7f7f4;border-left:4px solid #818b7e;padding:18px 22px;margin:22px 0;border-radius:0 6px 6px 0;">'
    +     '<p style="margin:0 0 10px;font-weight:600;color:#222;">Why we&rsquo;re reaching out</p>'
    +     '<p style="margin:0;color:#444;font-size:14px;line-height:1.7;">'
    +       'To keep your profile active and ensure we&rsquo;re working with your most current information, '
    +       'we&rsquo;d love for you to re-submit the Interest List questionnaire. Circumstances change &mdash; '
    +       'income, household size, employment &mdash; and an updated profile helps us match you with the right '
    +       'listing when one becomes available.'
    +     '</p>'
    +   '</div>'
    +   '<p style="text-align:center;margin:28px 0;">'
    +     '<a href="' + contactUrl + '" style="display:inline-block;background:#818b7e;color:#fff;'
    +     'padding:13px 32px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">'
    +     'Update My Profile &rarr;</a>'
    +   '</p>'
    +   '<p style="color:#555;font-size:13px;background:#f0f0eb;border-radius:4px;padding:12px 16px;margin:0 0 18px;">'
    +     '<strong>Important:</strong> Please use this same email address (<strong>' + escapeHtml(toEmail) + '</strong>) '
    +     'when re-submitting so we can update your existing profile. '
    +     'If you use a different email, a new profile will be created and this one will expire automatically.'
    +   '</p>'
    +   '<p style="color:#777;font-size:14px;">If you no longer need assistance finding an affordable home, no action is needed &mdash; '
    +   'your profile will be automatically removed from our active list in <strong>30 days</strong>.</p>'
    +   '<p style="color:#555;font-size:14px;">Questions? Email us at '
    +   '<a href="mailto:Info@CAAffordableHomes.com" style="color:#818b7e;">Info@CAAffordableHomes.com</a>.</p>'
    +   '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">'
    +   '<p style="color:#999;font-size:12px;margin:0;">'
    +     'CA Affordable Homes &bull; <a href="https://caaffordablehomes.com" style="color:#999;">caaffordablehomes.com</a><br>'
    +     'We are not a lender. This is not an offer or guarantee of housing.'
    +   '</p>'
    + '</div></div>';

  try {
    MailApp.sendEmail({
      to:       toEmail,
      subject:  subject,
      body:     body,
      htmlBody: htmlBody,
      name:     FROM_NAME,
      replyTo:  REPLY_TO
    });
    Logger.log('Renewal reminder sent to: ' + toEmail);
  } catch (err) {
    Logger.log('Renewal reminder failed for ' + toEmail + ': ' + err.message);
  }
}

/* ==========================================================
   PROPERTY SUBMISSION HANDLER
   ========================================================== */

var PS_SHEET = 'Property Submissions';

var PS_COLUMNS = [
  'submitted_at', 'status',
  'contact_name', 'contact_org', 'contact_email', 'contact_phone',
  'prop_address', 'affordable_count', 'bedrooms', 'bathrooms',
  'move_in_date', 'marketing_start', 'ami_percent', 'affordable_price',
  'hoa_fee', 'hoa_covers', 'prop_tax_pct', 'special_assessments',
  'deed_restriction_years', 'solar', 'solar_included', 'solar_lease_amount',
  'file_links'
];

function handlePropertySubmission(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PS_SHEET);
    sheet.getRange(1, 1, 1, PS_COLUMNS.length).setValues([PS_COLUMNS]);
    sheet.setFrozenRows(1);
  }

  var now   = new Date();
  var psCol = {};
  PS_COLUMNS.forEach(function (c, i) { psCol[c] = i + 1; });

  var row = new Array(PS_COLUMNS.length).fill('');
  row[psCol['submitted_at'] - 1] = now;
  row[psCol['status']       - 1] = 'new';

  var fields = [
    'contact_name','contact_org','contact_email','contact_phone',
    'prop_address','affordable_count','bedrooms','bathrooms',
    'move_in_date','marketing_start','ami_percent','affordable_price',
    'hoa_fee','hoa_covers','prop_tax_pct','special_assessments',
    'deed_restriction_years','solar','solar_included','solar_lease_amount'
  ];
  fields.forEach(function (k) {
    if (data[k] !== undefined) row[psCol[k] - 1] = data[k];
  });

  /* Save files to Drive — one subfolder per submission */
  var fileLinks = '';
  if (data.attachments && data.attachments.length > 0) {
    var parentFolder = getOrCreateDriveFolder('CA Affordable Homes - Property Submissions');
    var subName = buildSubmissionFolderName(data, now);
    var subFolder = parentFolder.createFolder(subName);
    var links = [];
    data.attachments.forEach(function (f) {
      try {
        var safeName = f.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').substring(0, 100);
        var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'application/octet-stream', safeName);
        var file = subFolder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        links.push(f.name + ': ' + file.getUrl());
      } catch (err) {
        links.push(f.name + ': (upload failed - ' + err.message + ')');
      }
    });
    fileLinks = links.join('\n');
  }
  row[psCol['file_links'] - 1] = fileLinks;

  sheet.appendRow(row);
  sendPropertyNotification(data, fileLinks);
  return jsonResponse({ ok: true });
}

function buildSubmissionFolderName(data, now) {
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var addr    = (data.prop_address || 'Unknown Address').replace(/[^a-zA-Z0-9 ,]/g, '').trim().substring(0, 60);
  var name    = (data.contact_name || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return dateStr + ' - ' + addr + (name ? ' (' + name + ')' : '');
}

function getOrCreateDriveFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function sendPropertyNotification(data, fileLinks) {
  var address = (data.prop_address || '(no address)');
  var subject = '[NEW PROPERTY] ' + address;
  var body =
    'A new property has been submitted for review.\n\n'
    + '--- CONTACT ---\n'
    + 'Name:          ' + (data.contact_name  || '') + '\n'
    + 'Organization:  ' + (data.contact_org   || '') + '\n'
    + 'Email:         ' + (data.contact_email || '') + '\n'
    + 'Phone:         ' + (data.contact_phone || '') + '\n\n'
    + '--- PROPERTY ---\n'
    + 'Address:           ' + address + '\n'
    + 'Affordable homes:  ' + (data.affordable_count || '') + '\n'
    + 'Bedrooms:          ' + (data.bedrooms         || '') + '\n'
    + 'Bathrooms:         ' + (data.bathrooms        || '') + '\n'
    + 'Move-in date:      ' + (data.move_in_date     || '') + '\n'
    + 'Marketing start:   ' + (data.marketing_start  || '') + '\n'
    + 'AMI target:        ' + (data.ami_percent      || '') + '\n'
    + 'Affordable price:  $' + (data.affordable_price || '') + '\n'
    + 'Property tax:      ' + (data.prop_tax_pct     || '') + '%\n'
    + 'HOA fee:           ' + (data.hoa_fee ? '$' + data.hoa_fee : 'N/A') + '\n'
    + 'HOA covers:        ' + (data.hoa_covers || 'N/A') + '\n'
    + 'Special assess.:   ' + (data.special_assessments || 'None') + '\n'
    + 'Deed restriction:  ' + (data.deed_restriction_years || '') + '\n'
    + 'Solar:             ' + (data.solar || '') + '\n'
    + (data.solar === 'Yes'
        ? 'Solar in price:    ' + (data.solar_included || '') + '\n'
          + (data.solar_included === 'No' ? 'Solar lease/mo:    $' + (data.solar_lease_amount || '') + '\n' : '')
        : '')
    + '\n--- FILES ---\n'
    + (fileLinks || 'No files submitted') + '\n';

  MailApp.sendEmail({
    to:      NOTIFY_EMAIL,
    subject: subject,
    body:    body,
    replyTo: data.contact_email || REPLY_TO
  });
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

  var reqSheet = ss.getSheetByName(LISTINGS_SHEET);
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

  var reqData           = reqSheet.getRange(2, 1, reqLastRow - 1, LISTINGS_COLUMNS.length).getValues();
  var listingsProcessed = 0;
  var digestSections    = []; /* collect all listing results for one digest email */

  for (var i = 0; i < reqData.length; i++) {
    var req    = rowToReqObj(reqData[i]);
    var active = (req['active'] || '').toString().trim().toLowerCase();
    if (active !== 'yes') continue;

    var results = matchApplicantsToListing(req, applicants);
    writeMatchResults(ss, results);

    var passes = results.filter(function (r) { return r.match_status === 'Pass'; });
    var closes = results.filter(function (r) { return r.match_status === 'Close'; });
    if (passes.length > 0 || closes.length > 0) {
      digestSections.push({
        name:   req['listing_name'] || req['listing_id'],
        passes: passes,
        closes: closes
      });
    }

    listingsProcessed++;
  }

  /* Send one consolidated digest instead of one email per listing */
  if (digestSections.length > 0) {
    sendMatchDigestEmail(digestSections);
  }

  Logger.log('Matching complete. Listings: ' + listingsProcessed + ' | Applicants: ' + applicants.length);
  rebuildDashboard();
}

/* ==========================================================
   onRequirementsEdit — installable onEdit trigger
   Re-runs matching only for the listing row that was edited.
   Set up via Triggers panel (see setup step 9 / Trigger A).
   ========================================================== */
function onRequirementsEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== LISTINGS_SHEET) return;

  var row = e.range.getRow();
  if (row === 1) return;

  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reqSheet = ss.getSheetByName(LISTINGS_SHEET);
  var rowData  = reqSheet.getRange(row, 1, 1, LISTINGS_COLUMNS.length).getValues()[0];
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
      applicant_name:  (ap['full_name'] || '').toString().trim(),
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
  var minCredit    = parseNum(req['min_credit_score'], 640);
  var selfScore    = parseNum(ap['credit_score_self'], null);
  var coScore      = parseNum(ap['credit_score_coborrower'], null);
  var apCredit     = (selfScore !== null && coScore !== null) ? Math.min(selfScore, coScore)
                   : (selfScore !== null ? selfScore : coScore);
  if (apCredit !== null && apCredit < minCredit) {
    var scoreDisplay = selfScore + (coScore !== null ? ' / ' + coScore : '');
    failed.push('Credit score (' + scoreDisplay + ', need ' + minCredit + '+)');
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
   sendMatchDigestEmail
   Sends ONE consolidated daily email covering all listings
   that have Pass or Close candidates. Called once per day
   after runMatchingForAllListings() finishes all listings.
   sections = [{ name, passes, closes }, ...]
   ========================================================== */
function sendMatchDigestEmail(sections) {
  if (!sections || sections.length === 0) return;

  var sheetUrl  = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';
  var runDate   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');
  var totalPass = 0;
  var totalClose = 0;
  sections.forEach(function (s) { totalPass += s.passes.length; totalClose += s.closes.length; });

  var subject = '[CA Affordable Homes] Daily Match Report — ' + runDate
    + ' (' + totalPass + ' Pass, ' + totalClose + ' Close)';

  /* ── Plain-text fallback ── */
  var body = 'Daily Match Report — ' + runDate + '\n'
    + totalPass + ' Pass | ' + totalClose + ' Close across ' + sections.length + ' listing(s)\n\n';
  sections.forEach(function (s) {
    body += '=== ' + s.name + ' ===\n';
    if (s.passes.length > 0) {
      body += 'PASS (' + s.passes.length + '):\n';
      s.passes.forEach(function (r) {
        body += '  ' + r.applicant_name + ' | ' + r.applicant_phone + ' | ' + r.applicant_email + '\n';
      });
    }
    if (s.closes.length > 0) {
      body += 'CLOSE (' + s.closes.length + '):\n';
      s.closes.forEach(function (r) {
        body += '  ' + r.applicant_name + ' | ' + r.applicant_phone + ' | ' + r.applicant_email + '\n';
        if (r.failed_fields) body += '    Issues: ' + r.failed_fields + '\n';
      });
    }
    body += '\n';
  });
  body += 'Full results: ' + sheetUrl;

  /* ── HTML email ── */
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;">'
    + '<div style="background:#818b7e;padding:22px 32px;">'
    +   '<p style="color:#fff;margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CA Affordable Homes — Matching Engine</p>'
    +   '<h1 style="color:#fff;margin:6px 0 0;font-size:20px;font-weight:600;">Daily Match Report &mdash; ' + escapeHtml(runDate) + '</h1>'
    + '</div>'
    + '<div style="padding:28px;">'
    + '<p style="color:#555;font-size:14px;margin:0 0 24px;">'
    +   '<strong>' + totalPass + ' Pass</strong> &nbsp;|&nbsp; <strong>' + totalClose + ' Close</strong>'
    +   ' across <strong>' + sections.length + '</strong> active listing(s).'
    + '</p>';

  sections.forEach(function (s) {
    html +=
      '<div style="margin-bottom:32px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">'
      + '<div style="background:#e8ede6;padding:12px 18px;">'
      +   '<span style="font-weight:700;color:#2a2a2a;font-size:15px;">' + escapeHtml(s.name) + '</span>'
      +   '&nbsp;&nbsp;'
      +   '<span style="font-size:13px;color:#1a5c38;font-weight:600;">&#10003; ' + s.passes.length + ' Pass</span>'
      +   '&nbsp;&nbsp;'
      +   '<span style="font-size:13px;color:#7a4f00;font-weight:600;">&#9888; ' + s.closes.length + ' Close</span>'
      + '</div>';

    if (s.passes.length > 0) {
      html +=
        '<div style="padding:14px 18px 0;">'
        + '<p style="margin:0 0 8px;font-weight:600;color:#1a5c38;font-size:13px;">PASS</p>'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<tr style="background:#f0f9f3;">'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Name</th>'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Phone</th>'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Email</th>'
        + '</tr>';
      s.passes.forEach(function (r) {
        html += '<tr style="border-bottom:1px solid #eee;">'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_name) + '</td>'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_phone) + '</td>'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_email) + '</td>'
          + '</tr>';
      });
      html += '</table></div>';
    }

    if (s.closes.length > 0) {
      html +=
        '<div style="padding:14px 18px 0;">'
        + '<p style="margin:0 0 8px;font-weight:600;color:#7a4f00;font-size:13px;">CLOSE &mdash; ' + CLOSE_THRESHOLD + ' or fewer issues</p>'
        + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<tr style="background:#fdf8f0;">'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Name</th>'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Phone</th>'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Email</th>'
        + '<th style="padding:7px 10px;text-align:left;color:#444;">Issues</th>'
        + '</tr>';
      s.closes.forEach(function (r) {
        html += '<tr style="border-bottom:1px solid #eee;">'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_name) + '</td>'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_phone) + '</td>'
          + '<td style="padding:7px 10px;">' + escapeHtml(r.applicant_email) + '</td>'
          + '<td style="padding:7px 10px;color:#7a4f00;">' + escapeHtml(r.failed_fields || '') + '</td>'
          + '</tr>';
      });
      html += '</table></div>';
    }

    html += '<div style="height:14px;"></div></div>'; /* bottom padding inside card */
  });

  html +=
    '<a href="' + sheetUrl + '" style="display:inline-block;background:#818b7e;color:#fff;'
    + 'padding:11px 24px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">'
    + 'Open Google Sheets &rarr;</a>'
    + '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">'
    + '<p style="color:#999;font-size:12px;margin:0;">CA Affordable Homes &bull; Automated daily matching engine</p>'
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
    Logger.log('Daily match digest sent. Listings: ' + sections.length + ' | Pass: ' + totalPass + ' | Close: ' + totalClose);
  } catch (err) {
    Logger.log('Daily match digest failed: ' + err.message);
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

/* ==========================================================
   rebuildDashboard
   Creates (or fully overwrites) the "Dashboard" tab with a
   clean, color-coded summary of Pass and Close candidates
   grouped by active listing. Called automatically at the end
   of runMatchingForAllListings(). Also run it manually once
   to create the tab for the first time (see setup step 10).
   ========================================================== */
function rebuildDashboard() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  /* ── Get active listings from Requirements ── */
  var reqSheet = ss.getSheetByName(LISTINGS_SHEET);
  if (!reqSheet || reqSheet.getLastRow() < 2) {
    Logger.log('rebuildDashboard: no Requirements rows — skipping.');
    return;
  }
  var reqData        = reqSheet.getRange(2, 1, reqSheet.getLastRow() - 1, LISTINGS_COLUMNS.length).getValues();
  var activeListings = [];
  for (var i = 0; i < reqData.length; i++) {
    var req = rowToReqObj(reqData[i]);
    if ((req['active'] || '').toString().trim().toLowerCase() === 'yes') activeListings.push(req);
  }

  /* ── Get all Match Results ── */
  var mrSheet    = ss.getSheetByName(MATCH_RESULTS_SHEET);
  var allResults = [];
  if (mrSheet && mrSheet.getLastRow() > 1) {
    var mrData = mrSheet.getRange(2, 1, mrSheet.getLastRow() - 1, MR_COLUMNS.length).getValues();
    for (var j = 0; j < mrData.length; j++) {
      allResults.push({
        listing_id: (mrData[j][0] || '').toString(),
        name:       (mrData[j][3] || '').toString(),
        phone:      (mrData[j][4] || '').toString(),
        email:      (mrData[j][2] || '').toString(),
        status:     (mrData[j][5] || '').toString(),
        failed:     (mrData[j][6] || '').toString(),
        run_at:     mrData[j][7]
      });
    }
  }

  /* ── Get address info from master Listings tab (address + city are appended columns) ── */
  var addressMap   = {};
  var addrColIdx   = LISTINGS_COLUMNS.indexOf('address');   /* 0-based */
  var cityColIdx   = LISTINGS_COLUMNS.indexOf('city');      /* 0-based */
  var listingsTab  = ss.getSheetByName(LISTINGS_SHEET);
  if (listingsTab && listingsTab.getLastRow() > 1) {
    var numCols = cityColIdx + 1; /* read up to and including city column */
    var lData   = listingsTab.getRange(2, 1, listingsTab.getLastRow() - 1, numCols).getValues();
    for (var k = 0; k < lData.length; k++) {
      var pName = (lData[k][0] || '').toString().trim();
      var addr  = (lData[k][addrColIdx] || '').toString().trim();
      var city  = (lData[k][cityColIdx] || '').toString().trim();
      if (pName) addressMap[pName] = addr + (city ? ', ' + city : '');
    }
  }

  /* ── Create or clear Dashboard tab ── */
  var dash = ss.getSheetByName(DASHBOARD_SHEET);
  if (!dash) {
    dash = ss.insertSheet(DASHBOARD_SHEET);
  } else {
    dash.clearContents();
    dash.clearFormats();
  }

  /* Set column widths: Name | Phone | Email | Submitted | Areas to Review */
  dash.setColumnWidth(1, 210);
  dash.setColumnWidth(2, 135);
  dash.setColumnWidth(3, 240);
  dash.setColumnWidth(4, 115);
  dash.setColumnWidth(5, 380);

  var row = 1;

  /* ── Title row ── */
  dash.getRange(row, 1, 1, 5).merge()
    .setValue('CA Affordable Homes — Match Dashboard')
    .setFontSize(15).setFontWeight('bold')
    .setBackground('#818b7e').setFontColor('#ffffff')
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  dash.setRowHeight(row, 40);
  row++;

  dash.getRange(row, 1, 1, 5).merge()
    .setValue('Last updated: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy \'at\' h:mm a'))
    .setFontSize(10).setFontStyle('italic').setFontColor('#888888')
    .setBackground('#f5f5f2');
  row++;

  if (activeListings.length === 0) {
    dash.getRange(row, 1, 1, 5).merge()
      .setValue('No active listings found in the Requirements tab.')
      .setFontColor('#888888').setFontStyle('italic');
    Logger.log('rebuildDashboard: no active listings.');
    return;
  }

  /* ── One block per active listing ── */
  activeListings.forEach(function (listing) {
    var listingId   = (listing['listing_id']   || '').toString().trim();
    var listingName = (listing['listing_name'] || listingId).toString().trim();
    var address     = addressMap[listingId] || '';

    var passes = allResults.filter(function (r) { return r.listing_id === listingId && r.status === 'Pass'; });
    var closes = allResults.filter(function (r) { return r.listing_id === listingId && r.status === 'Close'; });

    /* Blank spacer between blocks */
    if (row > 3) { dash.setRowHeight(row, 14); row++; }

    /* Listing name + address header */
    dash.getRange(row, 1, 1, 5).merge()
      .setValue(listingName + (address ? '   ·   ' + address : ''))
      .setFontSize(12).setFontWeight('bold')
      .setBackground('#e8ede6').setFontColor('#2a2a2a');
    dash.setRowHeight(row, 32);
    row++;

    /* Pass / Close count summary */
    dash.getRange(row, 1).setValue('✓  Pass: ' + passes.length)
      .setFontWeight('bold').setFontColor('#1a5c38').setBackground('#edf7f0');
    dash.getRange(row, 2).setValue('⚠  Close: ' + closes.length)
      .setFontWeight('bold').setFontColor('#7a4f00').setBackground('#fef8e7');
    dash.getRange(row, 3, 1, 3).setBackground('#f9f9f7');
    row++;

    /* ── Pass candidates table ── */
    if (passes.length > 0) {
      dash.getRange(row, 1, 1, 5).merge()
        .setValue('PASS CANDIDATES')
        .setFontWeight('bold').setFontSize(10)
        .setBackground('#d4edda').setFontColor('#1a5c38');
      row++;

      ['Name', 'Phone', 'Email', 'Submitted', ''].forEach(function (h, ci) {
        dash.getRange(row, ci + 1).setValue(h).setFontWeight('bold').setBackground('#f0f9f3').setFontColor('#333');
      });
      row++;

      passes.forEach(function (r) {
        dash.getRange(row, 1).setValue(r.name);
        dash.getRange(row, 2).setValue(r.phone);
        dash.getRange(row, 3).setValue(r.email);
        dash.getRange(row, 4).setValue(r.run_at instanceof Date
          ? Utilities.formatDate(r.run_at, Session.getScriptTimeZone(), 'MMM d, yyyy') : r.run_at.toString());
        row++;
      });
    }

    /* ── Close candidates table ── */
    if (closes.length > 0) {
      dash.getRange(row, 1, 1, 5).merge()
        .setValue('CLOSE CANDIDATES  —  minor areas to review')
        .setFontWeight('bold').setFontSize(10)
        .setBackground('#fff3cd').setFontColor('#7a4f00');
      row++;

      ['Name', 'Phone', 'Email', 'Submitted', 'Areas to Review'].forEach(function (h, ci) {
        dash.getRange(row, ci + 1).setValue(h).setFontWeight('bold').setBackground('#fffdf0').setFontColor('#333');
      });
      row++;

      closes.forEach(function (r) {
        dash.getRange(row, 1).setValue(r.name);
        dash.getRange(row, 2).setValue(r.phone);
        dash.getRange(row, 3).setValue(r.email);
        dash.getRange(row, 4).setValue(r.run_at instanceof Date
          ? Utilities.formatDate(r.run_at, Session.getScriptTimeZone(), 'MMM d, yyyy') : r.run_at.toString());
        dash.getRange(row, 5).setValue(r.failed).setFontColor('#7a4f00');
        row++;
      });
    }

    if (passes.length === 0 && closes.length === 0) {
      dash.getRange(row, 1, 1, 5).merge()
        .setValue('No Pass or Close candidates yet — matching runs daily at 7 AM.')
        .setFontColor('#aaaaaa').setFontStyle('italic');
      row++;
    }
  });

  /* Freeze the title + timestamp rows so they stay visible while scrolling */
  dash.setFrozenRows(2);

  Logger.log('Dashboard rebuilt: ' + activeListings.length + ' active listing(s).');
}

/* ── Utility functions ── */

function rowToReqObj(row) {
  var obj = {};
  for (var i = 0; i < LISTINGS_COLUMNS.length; i++) {
    obj[LISTINGS_COLUMNS[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
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
  var t1 = parseNum(ap['tax_1_total']);
  if (t1 !== null && t1 > 0) return t1;
  var t2 = parseNum(ap['tax_2_total']);
  if (t2 !== null && t2 > 0) return t2;
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

/* ==========================================================
   MIGRATION HELPER — run once after updating this script
   Merges old Listings (A-V) + old Requirements tabs into
   the new master Listings tab. Safe to re-run (checks first).
   ========================================================== */
function migrateToMasterListings() {
  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var masterTab = ss.getSheetByName(LISTINGS_SHEET);

  /* If master Listings already has data beyond headers, abort */
  if (masterTab && masterTab.getLastRow() > 1) {
    Logger.log('Master Listings tab already has data — migration skipped. Delete rows first if you want to re-run.');
    return;
  }

  /* Create or clear the master tab */
  if (!masterTab) {
    masterTab = ss.insertSheet(LISTINGS_SHEET);
  } else {
    masterTab.clearContents();
  }

  /* Write headers */
  masterTab.getRange(1, 1, 1, LISTINGS_COLUMNS.length).setValues([LISTINGS_COLUMNS]);
  masterTab.setFrozenRows(1);

  /* Read old Requirements tab */
  var reqTab  = ss.getSheetByName('Requirements');
  var oldReqs = {}; /* listing_id → row array */
  if (reqTab && reqTab.getLastRow() > 1) {
    var reqData = reqTab.getRange(2, 1, reqTab.getLastRow() - 1, 35).getValues();
    reqData.forEach(function (row) {
      var id = (row[0] || '').toString().trim();
      if (id) oldReqs[id] = row; /* index 0 = listing_id */
    });
  }

  /* Read old Listings tab if it exists and has different content */
  var oldListTab = ss.getSheetByName('_OldListings'); /* already renamed or skip */
  var propInfo   = {}; /* Property Name → { address, city, price, beds, baths, sqft, type, program } */

  /* Try reading from a tab named "Listings_bak" or similar if user renamed it */
  ['Listings_bak','Listings_backup','_OldListings'].forEach(function (n) {
    var t = ss.getSheetByName(n);
    if (t && t.getLastRow() > 1 && Object.keys(propInfo).length === 0) {
      var d = t.getRange(2, 1, t.getLastRow() - 1, 11).getValues();
      d.forEach(function (r) {
        var nm = (r[0] || '').toString().trim();
        if (nm) propInfo[nm] = { address: r[1], city: r[2], price: r[3], bedrooms: r[4],
          bathrooms: r[5], sqft: r[6], listing_type: r[8], program_type: r[10] };
      });
    }
  });

  /* Build merged rows */
  var newRows = [];
  Object.keys(oldReqs).forEach(function (id) {
    var req  = oldReqs[id];
    var prop = propInfo[id] || {};
    /* Start with all 35 old Requirements columns */
    var newRow = req.slice(0, 35);
    /* Pad to 35 if shorter */
    while (newRow.length < 35) newRow.push('');
    /* Append 9 new property info columns */
    newRow.push(
      prop.address      || '',
      prop.city         || '',
      prop.price        || '',
      prop.bedrooms     || '',
      prop.bathrooms    || '',
      prop.sqft         || '',
      prop.listing_type || '',
      prop.program_type || '',
      '' /* internal_notes */
    );
    newRows.push(newRow);
  });

  if (newRows.length > 0) {
    masterTab.getRange(2, 1, newRows.length, LISTINGS_COLUMNS.length).setValues(newRows);
    Logger.log('Migration complete: ' + newRows.length + ' listing(s) written to master Listings tab.');
  } else {
    Logger.log('Migration: no data found in old Requirements tab. Master Listings tab created with headers only.');
  }
}

/* ==========================================================
   SPREADSHEET SETUP UTILITIES
   Run these from the Apps Script editor (select function, click Run).

   setupAllSheets()       — creates every tab with correct headers (safe on existing data)
   resetSheet(name)       — wipes all data rows from a single named tab, keeps header
   resetAllDataSheets()   — wipes data rows from all tabs except Dashboard (keeps headers)
   ========================================================== */

/* Testimonials tab column headers (must match what testimonials.js expects) */
var TESTIMONIALS_SHEET   = 'Testimonials';
var TESTIMONIALS_COLUMNS = ['Quote', 'Attribution', 'Status'];

/* Programs columns also defined in admin-script.gs; duplicated here for setup utility */
var PROG_SHEET   = 'Programs';
var PROG_COLS    = ['Community Name', 'Area', 'Program Type', 'AMI Range',
                    'Bedrooms', 'Household Size Limit', 'First-Time Buyer',
                    'Price Range', 'Status', 'Notes'];

function setupAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  _ensureSheet(ss, IL_SHEET,             IL_COLUMNS);
  _ensureSheet(ss, LISTINGS_SHEET,       LISTINGS_COLUMNS);
  _ensureSheet(ss, PROG_SHEET,           PROG_COLS);
  _ensureSheet(ss, PS_SHEET,             PS_COLUMNS);
  _ensureSheet(ss, MATCH_RESULTS_SHEET,  MR_COLUMNS);
  _ensureSheet(ss, TESTIMONIALS_SHEET,   TESTIMONIALS_COLUMNS);
  Logger.log('setupAllSheets: all tabs verified/created.');
}

/* Creates the tab if missing, or adds any new header columns that don't exist yet.
   Never removes columns or touches data rows. */
function _ensureSheet(ss, name, columns) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
    Logger.log('  Created: ' + name + ' (' + columns.length + ' columns)');
    return;
  }
  /* Sheet exists — check if any columns are missing (append only) */
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                      .map(function (h) { return String(h).trim(); });
  var added = 0;
  columns.forEach(function (col) {
    if (existing.indexOf(col) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
      added++;
    }
  });
  if (added > 0) {
    sheet.setFrozenRows(1);
    Logger.log('  Updated: ' + name + ' (added ' + added + ' missing column(s))');
  } else {
    Logger.log('  OK: ' + name);
  }
}

/* Wipe all data rows from one named tab, keeping the header row */
function resetSheet(name) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) { Logger.log('resetSheet: tab not found — ' + name); return; }
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.deleteRows(2, last - 1);
    Logger.log('resetSheet: cleared ' + (last - 1) + ' data row(s) from ' + name);
  } else {
    Logger.log('resetSheet: ' + name + ' already empty');
  }
}

/* Wipe data rows from all tabs (except Dashboard which is auto-rebuilt) */
function resetAllDataSheets() {
  [IL_SHEET, LISTINGS_SHEET, PROG_SHEET, PS_SHEET, MATCH_RESULTS_SHEET, TESTIMONIALS_SHEET]
    .forEach(function (name) { resetSheet(name); });
  Logger.log('resetAllDataSheets complete.');
}

/* ==========================================================
   SEEDING UTILITIES
   Run these from the Apps Script editor to populate realistic
   test data.  Requires the tabs to exist first (run setupAllSheets).

   seedAllData()              — seeds every tab
   seedInterestList()         — 6 test applicants (various statuses)
   seedListings()             — 3 test listings (2 active, 1 inactive)
   seedPrograms()             — 3 test programs (available + coming soon)
   seedPropertySubmissions()  — 2 test property submissions
   seedTestimonials()         — 3 test testimonials (2 active, 1 inactive)
   ========================================================== */

function seedAllData() {
  seedListings();
  seedPrograms();
  seedInterestList();
  seedPropertySubmissions();
  seedTestimonials();
  Logger.log('seedAllData complete.');
}

/* ── Interest List seed ── */
function seedInterestList() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(IL_SHEET);
  if (!sheet) { Logger.log('seedInterestList: Interest List tab not found. Run setupAllSheets first.'); return; }

  var now   = new Date();
  var ago   = function (days) { var d = new Date(now); d.setDate(d.getDate() - days); return d; };

  /* Helper: build a sparse IL row from a plain object of field values */
  function ilRow(fields) {
    var row = new Array(IL_COLUMNS.length).fill('');
    for (var k in fields) {
      var idx = IL_COLUMNS.indexOf(k);
      if (idx > -1) row[idx] = fields[k];
    }
    return row;
  }

  var rows = [
    /* 1 — New applicant, likely eligible */
    ilRow({
      submitted_at: ago(3), status: 'new', updated_at: ago(3),
      full_name: 'Maria Garcia', phone: '(619) 555-0101', email: 'maria.garcia.test@example.com',
      owned_real_estate: 'No', household_size: 2, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 720, credit_score_coborrower: 695,
      monthly_rent: 1850, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'Maria', income_1_relationship: 'Self', income_1_annual: 62000,
      income_2_name: 'Carlos', income_2_relationship: 'Spouse or Partner', income_2_annual: 48000,
      tax_year_labels: '2024,2023,2022', tax_1_total: 108000, tax_2_total: 105000, tax_3_total: 98000,
      non_taxable_income: 'No', agent_yn: 'No',
      emp_1_name: 'Maria', emp_1_relationship: 'Self', emp_1_employer: 'City of San Diego', emp_1_status: 'Current',
      emp_1_income_type: 'Salary', emp_1_annual_salary: 62000,
      monthly_debt_payments: 420, foreclosure: 'No', bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 8000, asset_savings: 22000, asset_401k: 15000, asset_other: 0,
      loan_signers: 'Both', household_members: 'Maria Garcia, Carlos Garcia',
      area_preference: 'South Bay, Central San Diego',
      renewal_reminder_sent: '', original_signup_at: ago(3)
    }),

    /* 2 — Under review, borderline credit */
    ilRow({
      submitted_at: ago(14), status: 'reviewing', updated_at: ago(7),
      full_name: 'David Kim', phone: '(619) 555-0202', email: 'david.kim.test@example.com',
      owned_real_estate: 'No', household_size: 3, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 642, credit_score_coborrower: '',
      monthly_rent: 2200, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'David', income_1_relationship: 'Self', income_1_annual: 72000,
      income_2_name: 'Jin', income_2_relationship: 'Spouse or Partner', income_2_annual: 38000,
      income_3_name: 'Grace', income_3_relationship: 'Child', income_3_annual: 0,
      tax_year_labels: '2024,2023,2022', tax_1_total: 108000, tax_2_total: 104000, tax_3_total: 99000,
      non_taxable_income: 'No', agent_yn: 'Yes',
      emp_1_name: 'David', emp_1_relationship: 'Self', emp_1_employer: 'Qualcomm', emp_1_status: 'Current',
      emp_1_income_type: 'Salary', emp_1_annual_salary: 72000,
      monthly_debt_payments: 680, foreclosure: 'No', bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 5000, asset_savings: 30000, asset_401k: 45000, asset_other: 0,
      loan_signers: 'Both', household_members: 'David Kim, Jin Kim, Grace Kim',
      area_preference: 'North County Inland, East County',
      renewal_reminder_sent: '', original_signup_at: ago(14)
    }),

    /* 3 — Active, strong profile */
    ilRow({
      submitted_at: ago(60), status: 'active', updated_at: ago(60),
      full_name: 'Sarah Johnson', phone: '(858) 555-0303', email: 'sarah.johnson.test@example.com',
      owned_real_estate: 'No', household_size: 4, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 712, credit_score_coborrower: 698,
      monthly_rent: 2600, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'Sarah', income_1_relationship: 'Self', income_1_annual: 58000,
      income_2_name: 'Tom', income_2_relationship: 'Spouse or Partner', income_2_annual: 64000,
      income_3_name: 'Emma', income_3_relationship: 'Child', income_3_annual: 0,
      income_4_name: 'Liam', income_4_relationship: 'Child', income_4_annual: 0,
      tax_year_labels: '2024,2023,2022', tax_1_total: 120000, tax_2_total: 115000, tax_3_total: 108000,
      non_taxable_income: 'No', agent_yn: 'No',
      emp_1_name: 'Sarah', emp_1_relationship: 'Self', emp_1_employer: 'Sharp Healthcare', emp_1_status: 'Current',
      emp_1_income_type: 'Salary', emp_1_annual_salary: 58000,
      emp_2_name: 'Tom', emp_2_relationship: 'Spouse or Partner', emp_2_employer: 'SDGE', emp_2_status: 'Current',
      emp_2_income_type: 'Salary', emp_2_annual_salary: 64000,
      monthly_debt_payments: 550, foreclosure: 'No', bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 12000, asset_savings: 45000, asset_401k: 62000, asset_other: 0,
      loan_signers: 'Both', household_members: 'Sarah Johnson, Tom Johnson, Emma Johnson, Liam Johnson',
      area_preference: 'South Bay',
      renewal_reminder_sent: '', original_signup_at: ago(60)
    }),

    /* 4 — Matched, process complete */
    ilRow({
      submitted_at: ago(180), status: 'matched', updated_at: ago(30),
      full_name: 'Robert Chen', phone: '(619) 555-0404', email: 'robert.chen.test@example.com',
      owned_real_estate: 'No', household_size: 1, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 755, credit_score_coborrower: '',
      monthly_rent: 1600, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'Robert', income_1_relationship: 'Self', income_1_annual: 56000,
      tax_year_labels: '2024,2023,2022', tax_1_total: 56000, tax_2_total: 53000, tax_3_total: 50000,
      non_taxable_income: 'No', agent_yn: 'No',
      emp_1_name: 'Robert', emp_1_relationship: 'Self', emp_1_employer: 'UC San Diego', emp_1_status: 'Current',
      emp_1_income_type: 'Salary', emp_1_annual_salary: 56000,
      monthly_debt_payments: 280, foreclosure: 'No', bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 9000, asset_savings: 35000, asset_401k: 28000, asset_other: 0,
      loan_signers: 'Self only', household_members: 'Robert Chen',
      area_preference: 'City of San Diego - Urban Core',
      renewal_reminder_sent: '', original_signup_at: ago(180)
    }),

    /* 5 — Expired, over 12 months old */
    ilRow({
      submitted_at: ago(390), status: 'expired', updated_at: ago(1),
      full_name: 'Lisa Torres', phone: '(760) 555-0505', email: 'lisa.torres.test@example.com',
      owned_real_estate: 'No', household_size: 2, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 678, credit_score_coborrower: '',
      monthly_rent: 1750, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'Lisa', income_1_relationship: 'Self', income_1_annual: 48000,
      income_2_name: 'Ana', income_2_relationship: 'Parent', income_2_annual: 18000,
      tax_year_labels: '2023,2022,2021', tax_1_total: 65000, tax_2_total: 62000, tax_3_total: 60000,
      non_taxable_income: 'No', agent_yn: 'No',
      emp_1_name: 'Lisa', emp_1_relationship: 'Self', emp_1_employer: 'San Diego Unified', emp_1_status: 'Current',
      emp_1_income_type: 'Salary', emp_1_annual_salary: 48000,
      monthly_debt_payments: 350, foreclosure: 'No', bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 3000, asset_savings: 8000, asset_401k: 5000, asset_other: 0,
      loan_signers: 'Self only', household_members: 'Lisa Torres, Ana Torres',
      area_preference: 'North County Coastal',
      renewal_reminder_sent: 'Yes', original_signup_at: ago(390)
    }),

    /* 6 — New, has prior foreclosure (tests Close/Fail path) */
    ilRow({
      submitted_at: ago(1), status: 'new', updated_at: ago(1),
      full_name: 'Michael Brown', phone: '(619) 555-0606', email: 'michael.brown.test@example.com',
      owned_real_estate: 'No', household_size: 5, lived_together_12mo: 'Yes',
      live_in_sd_county: 'Yes', credit_score_self: 622, credit_score_coborrower: 610,
      monthly_rent: 2800, rent_subsidized: 'No',
      worked_lived_sd_2yr: 'Yes', sdhc_prior_purchase: 'No',
      income_1_name: 'Michael', income_1_relationship: 'Self', income_1_annual: 55000,
      income_2_name: 'Angela', income_2_relationship: 'Spouse or Partner', income_2_annual: 42000,
      income_3_name: 'Tyler', income_3_relationship: 'Child', income_3_annual: 0,
      income_4_name: 'Madison', income_4_relationship: 'Child', income_4_annual: 0,
      income_5_name: 'Jake', income_5_relationship: 'Child', income_5_annual: 0,
      tax_year_labels: '2024,2023,2022', tax_1_total: 96000, tax_2_total: 90000, tax_3_total: 85000,
      non_taxable_income: 'No', agent_yn: 'No',
      emp_1_name: 'Michael', emp_1_relationship: 'Self', emp_1_employer: 'Pacific Building Co', emp_1_status: 'Current',
      emp_1_income_type: 'Hourly', emp_1_hourly_rate: 28, emp_1_hours_per_week: 40,
      monthly_debt_payments: 920, foreclosure: 'Yes', foreclosure_date: '2021-06-01',
      bankruptcy: 'No', judgments: 'No',
      us_citizen: 'Yes', permanent_resident: '',
      asset_checking: 2000, asset_savings: 5000, asset_401k: 0, asset_other: 0,
      loan_signers: 'Both', household_members: 'Michael Brown, Angela Brown, Tyler Brown, Madison Brown, Jake Brown',
      area_preference: 'South Bay, East County',
      renewal_reminder_sent: '', original_signup_at: ago(1)
    })
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, IL_COLUMNS.length).setValues(rows);
  Logger.log('seedInterestList: inserted ' + rows.length + ' test applicants.');
}

/* ── Listings seed ── */
function seedListings() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(LISTINGS_SHEET);
  if (!sheet) { Logger.log('seedListings: Listings tab not found. Run setupAllSheets first.'); return; }

  /* Build a sparse listing row from a plain object */
  function lstRow(fields) {
    var row = new Array(LISTINGS_COLUMNS.length).fill('');
    for (var k in fields) {
      var idx = LISTINGS_COLUMNS.indexOf(k);
      if (idx > -1) row[idx] = fields[k];
    }
    return row;
  }

  var rows = [
    /* Community 1 — Active, 80% AMI, South Bay */
    lstRow({
      listing_id: 'chula-vista-terrace', listing_name: 'Chula Vista Terrace', active: 'YES',
      ami_percent: 80, min_household_size: 2, max_household_size: 6,
      max_income_1person: 75000, max_income_2person: 85700, max_income_3person: 96400,
      max_income_4person: 107050, max_income_5person: 115600, max_income_6person: 124150,
      min_income: 40000, min_credit_score: 640, max_dti_percent: 45, max_monthly_debt: 1800,
      first_time_buyer_required: 'YES', no_ownership_years: 3,
      sd_county_residency_required: 'YES', sd_residency_months: 24,
      household_together_months: 12, sdhc_prior_purchase_allowed: 'NO',
      foreclosure_allowed: 'YES', foreclosure_min_years: 4,
      bankruptcy_allowed: 'YES', bankruptcy_min_years: 4,
      judgments_allowed: 'NO', citizenship_required: 'NO', permanent_resident_acceptable: 'YES',
      min_assets: 5000, max_assets: 0, min_down_payment_pct: 3, max_down_payment_pct: 20,
      min_employment_months: 24,
      program_notes: 'San Diego Housing Commission program. Requires buyer education completion prior to close.',
      address: '(Contact for address)', city: 'Chula Vista', price: 479000,
      bedrooms: 3, bathrooms: 2, sqft: 1420, listing_type: 'affordable', program_type: 'SDHC Low-Income',
      internal_notes: 'Seed data - 4 units available, move-in ready Q3 2025'
    }),

    /* Community 2 — Active, 100% AMI, Central San Diego */
    lstRow({
      listing_id: 'north-park-row-homes', listing_name: 'North Park Row Homes', active: 'YES',
      ami_percent: 100, min_household_size: 1, max_household_size: 4,
      max_income_1person: 93750, max_income_2person: 107150, max_income_3person: 120550,
      max_income_4person: 133900, max_income_5person: 144600, max_income_6person: 155200,
      min_income: 50000, min_credit_score: 660, max_dti_percent: 45, max_monthly_debt: 2200,
      first_time_buyer_required: 'YES', no_ownership_years: 3,
      sd_county_residency_required: 'YES', sd_residency_months: 12,
      household_together_months: 12, sdhc_prior_purchase_allowed: 'NO',
      foreclosure_allowed: 'YES', foreclosure_min_years: 5,
      bankruptcy_allowed: 'YES', bankruptcy_min_years: 4,
      judgments_allowed: 'NO', citizenship_required: 'NO', permanent_resident_acceptable: 'YES',
      min_assets: 8000, max_assets: 0, min_down_payment_pct: 3, max_down_payment_pct: 15,
      min_employment_months: 24,
      program_notes: 'City of San Diego affordable ownership program. HOA covers exterior maintenance.',
      address: '(Contact for address)', city: 'San Diego', price: 580000,
      bedrooms: 2, bathrooms: 2, sqft: 1180, listing_type: 'affordable', program_type: 'City Affordable',
      internal_notes: 'Seed data - 2 units remaining, strong interest list pipeline'
    }),

    /* Community 3 — Inactive (coming fall), East County */
    lstRow({
      listing_id: 'spring-valley-family-homes', listing_name: 'Spring Valley Family Homes', active: 'NO',
      ami_percent: 80, min_household_size: 2, max_household_size: 6,
      max_income_1person: 75000, max_income_2person: 85700, max_income_3person: 96400,
      max_income_4person: 107050, max_income_5person: 115600, max_income_6person: 124150,
      min_income: 38000, min_credit_score: 640, max_dti_percent: 45, max_monthly_debt: 1800,
      first_time_buyer_required: 'YES', no_ownership_years: 3,
      sd_county_residency_required: 'YES', sd_residency_months: 24,
      household_together_months: 12, sdhc_prior_purchase_allowed: 'NO',
      foreclosure_allowed: 'YES', foreclosure_min_years: 4,
      bankruptcy_allowed: 'YES', bankruptcy_min_years: 4,
      judgments_allowed: 'NO', citizenship_required: 'NO', permanent_resident_acceptable: 'YES',
      min_assets: 5000, max_assets: 0, min_down_payment_pct: 3, max_down_payment_pct: 20,
      min_employment_months: 24,
      program_notes: 'Developer-direct affordable program, 8 homes planned. Lottery selection process expected.',
      address: '(Contact for address)', city: 'Spring Valley', price: 465000,
      bedrooms: 4, bathrooms: 2, sqft: 1650, listing_type: 'affordable', program_type: 'Developer Affordable',
      internal_notes: 'Seed data - coming fall. Begin marketing July 2025. Confirm developer timeline.'
    })
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LISTINGS_COLUMNS.length).setValues(rows);
  Logger.log('seedListings: inserted ' + rows.length + ' test listings.');
}

/* ── Programs seed ── */
function seedPrograms() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PROG_SHEET);
  if (!sheet) {
    /* Auto-create with headers if missing */
    sheet = ss.insertSheet(PROG_SHEET);
    sheet.getRange(1, 1, 1, PROG_COLS.length).setValues([PROG_COLS]);
    sheet.setFrozenRows(1);
  }

  var rows = [
    ['Chula Vista Terrace',       'South Bay',              'SDHC Low-Income', '80% AMI', '3',   '2-6',  'Yes', '$479,000',  'Available',   'Buyer education required. 4 units ready Q3 2025.'],
    ['North Park Row Homes',      'Central San Diego',      'City Affordable',  '100% AMI','2',   '1-4',  'Yes', '$580,000',  'Available',   'HOA covers exterior maintenance. 2 units remaining.'],
    ['Spring Valley Family Homes','East County',            'Developer Affordable','80% AMI','3-4','2-6', 'Yes', '$465,000',  'Coming Soon', 'Lottery selection expected. 8 homes planned fall 2025.']
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PROG_COLS.length).setValues(rows);
  Logger.log('seedPrograms: inserted ' + rows.length + ' test programs.');
}

/* ── Property Submissions seed ── */
function seedPropertySubmissions() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PS_SHEET);
  if (!sheet) { Logger.log('seedPropertySubmissions: Property Submissions tab not found. Run setupAllSheets first.'); return; }

  var now = new Date();
  var ago = function (days) { var d = new Date(now); d.setDate(d.getDate() - days); return d; };

  function psRow(fields) {
    var row = new Array(PS_COLUMNS.length).fill('');
    PS_COLUMNS.forEach(function (col, i) {
      if (fields[col] !== undefined) row[i] = fields[col];
    });
    return row;
  }

  var rows = [
    psRow({
      submitted_at: ago(5), status: 'new',
      contact_name: 'James Reyes', contact_org: 'South Bay Development Group', contact_email: 'jreyes.test@example.com', contact_phone: '(619) 555-0701',
      prop_address: '(Chula Vista — address available upon request)', affordable_count: 4, bedrooms: 3, bathrooms: 2,
      move_in_date: '2025-09-01', marketing_start: '2025-07-15', ami_percent: 80, affordable_price: 479000,
      hoa_fee: 220, hoa_covers: 'Exterior maintenance, landscaping, trash', prop_tax_pct: 1.1,
      special_assessments: 'None', deed_restriction_years: 45, solar: 'Yes', solar_included: 'Yes', solar_lease_amount: 0,
      file_links: ''
    }),
    psRow({
      submitted_at: ago(12), status: 'reviewing',
      contact_name: 'Patricia Nguyen', contact_org: 'City of San Diego Housing Division', contact_email: 'pnguyen.test@example.com', contact_phone: '(619) 555-0802',
      prop_address: '(North Park — address available upon request)', affordable_count: 2, bedrooms: 2, bathrooms: 2,
      move_in_date: '2025-08-01', marketing_start: '2025-06-01', ami_percent: 100, affordable_price: 580000,
      hoa_fee: 310, hoa_covers: 'Roof, exterior, water, trash, common areas', prop_tax_pct: 1.0,
      special_assessments: 'None', deed_restriction_years: 55, solar: 'No', solar_included: 'No', solar_lease_amount: 0,
      file_links: ''
    })
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PS_COLUMNS.length).setValues(rows);
  Logger.log('seedPropertySubmissions: inserted ' + rows.length + ' test submissions.');
}

/* ── Testimonials seed ── */
function seedTestimonials() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(TESTIMONIALS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TESTIMONIALS_SHEET);
    sheet.getRange(1, 1, 1, TESTIMONIALS_COLUMNS.length).setValues([TESTIMONIALS_COLUMNS]);
    sheet.setFrozenRows(1);
  }

  var rows = [
    ['Before finding this site, I didn\'t think I qualified for anything. The interest list process was simple, and I finally understood what I could realistically afford. It gave me confidence to move forward.', 'First-Time Buyer', 'active'],
    ['The breakdown of monthly costs and debt ratios was extremely helpful. There was no pressure, just clear information. That made all the difference.', 'Affordable Housing Buyer', 'active'],
    ['We needed a better way to identify qualified buyers for our affordable units. The structured screening process saved us time and ensured we were working with eligible applicants.', 'Developer Partner', 'inactive']
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TESTIMONIALS_COLUMNS.length).setValues(rows);
  Logger.log('seedTestimonials: inserted ' + rows.length + ' test testimonials (2 active, 1 inactive).');
}
