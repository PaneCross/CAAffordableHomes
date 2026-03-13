/* ==========================================================
   CA Affordable Homes — Listing Notification Apps Script
   ==========================================================

   SETUP INSTRUCTIONS (do this once):

   1. Open your Google Sheet
   2. Click Extensions → Apps Script
   3. Delete the default empty function
   4. Paste this entire file and click Save (disk icon)

   5. UPDATE THE SUBSCRIBERS TAB HEADERS (listing alert sign-ups):
      - Set the header row to these exact column names:
        A: Email | B: First Name | C: Last Name | D: Phone | E: Regions | F: Date Subscribed
      - Clear any test rows added before this update (column layout changed)

   5b. INTEREST LIST TAB — no manual setup needed:
      - The "Interest List" tab is created automatically on the first form submission.
      - Column headers are written by the script. Do not rename or reorder them.
      - Set status values manually: "new" (default) → "reviewing" → "matched" → "expired".

   5c. REQUIREMENTS TAB — create manually before running matching:
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

   5d. MATCH RESULTS TAB — created automatically on first match run.
      - Do not rename or delete it.
      - Columns: listing_id, listing_name, applicant_email, applicant_name,
                 applicant_phone, match_status (Pass/Close/Fail),
                 failed_fields, run_at

   6. DEPLOY / UPDATE:
      - If first time: Click Deploy → New deployment → Web App
        Execute as: Me | Who has access: Anyone → Deploy → Authorize
      - If updating: Click Deploy → Manage deployments → Edit (pencil icon)
        Set Version to "New version" → Deploy
        The Web App URL stays the same — no need to update homes.html or contact.html

   7. SET UP TRIGGERS (do this once in the Triggers panel):

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

      TRIGGER C — Notify subscribers when a listing City is updated:
      - Click "+ Add Trigger" again
      - Choose function: onListingChange
      - Event source: From spreadsheet
      - Event type: On edit
      - Click Save

   ========================================================== */

/* ── Configuration ── */
var SPREADSHEET_ID  = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var LISTINGS_SHEET  = 'Listings';
var SUBS_SHEET      = 'Subscribers';
var SITE_URL        = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var SCRIPT_URL      = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';
var FROM_NAME       = 'CA Affordable Homes Team';
var REPLY_TO        = 'Info@CAAffordableHomes.com';

/* ── Matching configuration ── */
var REQUIREMENTS_SHEET  = 'Requirements';
var MATCH_RESULTS_SHEET = 'Match Results';
var CLOSE_THRESHOLD     = 2;  /* applicants with <= this many failed fields are "Close" */
var NOTIFY_EMAIL        = 'tj@nostos.tech'; /* switch to Kacee's address at Phase 8 launch */

/* ── Subscriber sheet column positions (1-based) ──
   A: Email | B: First Name | C: Last Name | D: Phone | E: Regions | F: Date Subscribed */
var COL_EMAIL      = 1;
var COL_FIRST_NAME = 2;
var COL_LAST_NAME  = 3;
var COL_PHONE      = 4;
var COL_REGIONS    = 5;
var COL_DATE       = 6;
var SUBS_COL_COUNT = 6;

/* ── Interest List sheet name ── */
var IL_SHEET = 'Interest List';

/* ── Interest List column order (must stay in sync with contact.html field names) ──
   Columns are created automatically on first doPost if the tab doesn't exist.
   Do NOT reorder — append new fields at the end to keep existing data aligned.

   System (A–C)
   Section I  — General Information (D–Q)
   Section II — Income members ×6, tax-year income, non-taxable (R–AO)
   Section III — Employment ×4 (AP–EK)
   Section IV — Financial & Disclosures (EL–EZ)            */
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
  /* Section II — income members (up to 6; 3 columns each) */
  'income_1_name', 'income_1_relationship', 'income_1_annual',
  'income_2_name', 'income_2_relationship', 'income_2_annual',
  'income_3_name', 'income_3_relationship', 'income_3_annual',
  'income_4_name', 'income_4_relationship', 'income_4_annual',
  'income_5_name', 'income_5_relationship', 'income_5_annual',
  'income_6_name', 'income_6_relationship', 'income_6_annual',
  /* Tax-year income */
  'income_2023_total', 'income_2023_sched_c',
  'income_2024_total', 'income_2024_sched_c',
  'income_2025_total', 'income_2025_sched_c',
  /* Non-taxable income */
  'non_taxable_income', 'non_taxable_who', 'non_taxable_source',
  'non_taxable_amount', 'non_taxable_end_date_yn', 'non_taxable_end_date',
  /* Section III — employment entries (up to 4; 16 columns each) */
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
   Leave a cell blank to skip that check for this listing.              */
var REQ_COLUMNS = [
  'listing_id',                    /* A — must match Property Name in Listings tab */
  'listing_name',                  /* B — display name used in emails */
  'active',                        /* C — YES to include in daily matching */
  'ami_percent',                   /* D — e.g. "80%" — reference only, not used in matching */
  'min_household_size',            /* E — minimum household size */
  'max_household_size',            /* F — maximum household size */
  'max_income_1person',            /* G — max annual household income for 1-person household */
  'max_income_2person',            /* H */
  'max_income_3person',            /* I */
  'max_income_4person',            /* J */
  'max_income_5person',            /* K */
  'max_income_6person',            /* L */
  'min_income',                    /* M — minimum household income (some programs require this) */
  'min_credit_score',              /* N — default 640 per all programs */
  'max_dti_percent',               /* O — debt-to-income %, default 45 */
  'max_monthly_debt',              /* P — alternative absolute dollar cap on monthly debt */
  'first_time_buyer_required',     /* Q — YES/NO — cannot have owned in last X years */
  'no_ownership_years',            /* R — years since last ownership, default 3 */
  'sd_county_residency_required',  /* S — YES/NO */
  'sd_residency_months',           /* T — months required, default 24 */
  'household_together_months',     /* U — how long household must have lived together, default 12 */
  'sdhc_prior_purchase_allowed',   /* V — YES/NO — prior SDHC program participation */
  'foreclosure_allowed',           /* W — YES/NO */
  'foreclosure_min_years',         /* X — years since foreclosure/short sale required */
  'bankruptcy_allowed',            /* Y — YES/NO */
  'bankruptcy_min_years',          /* Z — years since discharge required */
  'judgments_allowed',             /* AA — YES/NO — outstanding judgments/garnishments/liens */
  'citizenship_required',          /* AB — YES/NO */
  'permanent_resident_acceptable', /* AC — YES/NO — green card accepted if citizenship required */
  'min_assets',                    /* AD — minimum total assets */
  'max_assets',                    /* AE — maximum total assets */
  'min_down_payment_pct',          /* AF — minimum down payment % */
  'max_down_payment_pct',          /* AG — maximum down payment % */
  'min_employment_months',         /* AH — minimum continuous employment months */
  'program_notes'                  /* AI — free text, Kacee reference only, not used in matching */
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

/* ── Region → Cities mapping ──
   Add or edit city names here at any time.
   Matching is case-insensitive and checks if the listing's
   City value contains any city in the list (or vice versa).  */
var REGION_CITIES = {
  'north-county-coastal': [
    'oceanside', 'carlsbad', 'encinitas', 'del mar',
    'solana beach', 'san marcos', 'leucadia', 'cardiff'
  ],
  'north-county-inland': [
    'vista', 'escondido', 'ramona', 'valley center',
    'fallbrook', 'bonsall', 'san marcos', 'poway',
    'rancho bernardo', '4s ranch'
  ],
  'central-san-diego': [
    'la jolla', 'kearny mesa', 'mission valley', 'university city',
    'normal heights', 'kensington', 'college area', 'linda vista',
    'clairemont', 'tierrasanta', 'mission hills', 'old town'
  ],
  'east-county': [
    'el cajon', 'santee', 'la mesa', 'lemon grove',
    'lakeside', 'spring valley', 'jamul', 'alpine',
    'flinn springs', 'helix', 'rancho san diego'
  ],
  'downtown-metro': [
    'downtown', 'north park', 'hillcrest', 'golden hill',
    'barrio logan', 'logan heights', 'south park', 'little italy',
    'east village', 'gaslamp', 'bankers hill', 'middletown',
    'sherman heights', 'city heights', 'university heights'
  ],
  'south-bay': [
    'chula vista', 'national city', 'imperial beach',
    'bonita', 'coronado', 'otay ranch', 'eastlake',
    'san ysidro', 'paradise hills'
  ]
};

/* ── Friendly display names for each region key ── */
var REGION_NAMES = {
  'north-county-coastal': 'North County Coastal',
  'north-county-inland':  'North County Inland',
  'central-san-diego':    'Central San Diego',
  'east-county':          'East County',
  'downtown-metro':       'Downtown / Metro',
  'south-bay':            'South Bay'
};

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
        var existingEmail  = (emailVals[i][0] || '').toString().trim().toLowerCase();
        if (existingEmail === email) {
          var existingStatus = sheet.getRange(i + 2, IL_COL['status']).getValue();
          if (existingStatus !== 'expired') {
            /* Keep original submitted_at and current status; bump updated_at */
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

    /* Send emails */
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
   Emails the inquiry to the internal team and returns { ok: true }.
   No sheet row is written for MLS inquiries.
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

  var subject =
    '[MLS Inquiry] ' + propName + ' \u2014 ' + (name || 'Anonymous') + ' <' + email + '>';

  var body =
    'MLS Property Inquiry\n\n'
    + 'Property: ' + propName + '\n'
    + '---\n'
    + 'Name:    ' + name    + '\n'
    + 'Email:   ' + email   + '\n'
    + 'Phone:   ' + (phone  || '(not provided)') + '\n'
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

  /* Copy every recognised field from the submitted payload */
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
    + 'Need to update your information at any time? Just email us at Info@CAAffordableHomes.com '
    + 'with your name and the changes.\n\n'
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
    +     '<a href="mailto:Info@CAAffordableHomes.com" style="color:#818b7e;">Info@CAAffordableHomes.com</a>'
    +     ' with your name and the changes.'
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
    + 'Action:           ' + (updated ? 'UPDATED (returning applicant)' : 'NEW') + '\n'
    + '---\n'
    + 'Name:             ' + fullName + '\n'
    + 'Email:            ' + (data.email || '') + '\n'
    + 'Phone:            ' + (data.phone || '') + '\n'
    + '---\n'
    + 'Household size:   ' + (data.household_size || '') + '\n'
    + 'Credit score:     ' + (data.credit_score_range || '') + '\n'
    + 'Monthly rent:     $' + (data.monthly_rent || '0') + '\n'
    + 'Monthly debt:     $' + (data.monthly_debt_payments || '0') + '\n'
    + '---\n'
    + '2023 income:      $' + (data.income_2023_total || '0') + '\n'
    + '2024 income:      $' + (data.income_2024_total || '0') + '\n'
    + '2025 income:      $' + (data.income_2025_total || '') + '\n'
    + '---\n'
    + 'Checking assets:  $' + (data.asset_checking || '0') + '\n'
    + 'Savings assets:   $' + (data.asset_savings || '0') + '\n'
    + '---\n'
    + 'Foreclosure:      ' + (data.foreclosure || 'No') + '\n'
    + 'Bankruptcy:       ' + (data.bankruptcy || 'No') + '\n'
    + 'Judgments:        ' + (data.judgments || 'No') + '\n'
    + '---\n'
    + 'Owned real estate:  ' + (data.owned_real_estate || '') + '\n'
    + 'SD resident 2yr:    ' + (data.worked_lived_sd_2yr || '') + '\n'
    + 'SDHC prior purchase:' + (data.sdhc_prior_purchase || '') + '\n'
    + '---\n'
    + 'Listing interest: ' + (data.listing_interest_summary || '(none selected)') + '\n\n'
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
   doGet — routes to subscribe or unsubscribe based on ?action=
   ========================================================== */
function doGet(e) {
  var action = ((e.parameter && e.parameter.action) || 'subscribe').toLowerCase();
  if (action === 'unsubscribe') return handleUnsubscribe(e);
  return handleSubscribe(e);
}

/* ── Subscribe: adds or updates a subscriber row ── */
function handleSubscribe(e) {
  try {
    var email     = (e.parameter.email      || '').trim().toLowerCase();
    var firstName = (e.parameter.first_name || '').trim();
    var lastName  = (e.parameter.last_name  || '').trim();
    var phone     = (e.parameter.phone      || '').trim();
    var regions   = (e.parameter.regions    || '').trim();

    if (!email || !regions) {
      return jsonResponse({ ok: false, error: 'Missing email or regions' });
    }

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SUBS_SHEET);

    /* Check for existing subscriber with same email — update if found */
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, SUBS_COL_COUNT).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0].toString().toLowerCase() === email) {
          sheet.getRange(i + 2, COL_FIRST_NAME).setValue(firstName);
          sheet.getRange(i + 2, COL_LAST_NAME).setValue(lastName);
          sheet.getRange(i + 2, COL_PHONE).setValue(phone);
          sheet.getRange(i + 2, COL_REGIONS).setValue(regions);
          sheet.getRange(i + 2, COL_DATE).setValue(new Date());
          return jsonResponse({ ok: true, updated: true });
        }
      }
    }

    /* New subscriber — append a row */
    sheet.appendRow([email, firstName, lastName, phone, regions, new Date()]);
    return jsonResponse({ ok: true });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/* ── Unsubscribe: deletes subscriber row, returns a styled confirmation page ── */
function handleUnsubscribe(e) {
  var email = ((e.parameter && e.parameter.email) || '').trim().toLowerCase();
  if (!email) {
    return HtmlService.createHtmlOutput(
      unsubPage('Invalid Link', 'This unsubscribe link is not valid.')
    );
  }
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SUBS_SHEET);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, COL_EMAIL, lastRow - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0].toString().toLowerCase() === email) {
          sheet.deleteRow(i + 2);
          return HtmlService.createHtmlOutput(unsubPage(
            'Unsubscribed',
            'You have been successfully removed from our listing alerts. You will no longer receive notifications from CA Affordable Homes.'
          ));
        }
      }
    }
    return HtmlService.createHtmlOutput(unsubPage(
      'Not Found',
      'We could not find a subscription for that email address. You may have already unsubscribed.'
    ));
  } catch (err) {
    return HtmlService.createHtmlOutput(unsubPage(
      'Error',
      'Something went wrong. Please email Info@CAAffordableHomes.com to unsubscribe.'
    ));
  }
}

/* ── Renders a simple branded HTML page for the unsubscribe flow ── */
function unsubPage(title, message) {
  return '<html><head><meta charset="UTF-8">'
    + '<style>body{font-family:Arial,sans-serif;max-width:500px;margin:80px auto;text-align:center;'
    + 'color:#333;padding:0 1rem;}h2{color:#818b7e;}a{color:#818b7e;}</style></head>'
    + '<body>'
    + '<p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#818b7e;margin-bottom:0;">CA Affordable Homes</p>'
    + '<h2>' + title + '</h2>'
    + '<p>' + message + '</p>'
    + '<p><a href="' + SITE_URL + '">Return to CA Affordable Homes</a></p>'
    + '</body></html>';
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================
   onListingChange — installable onEdit trigger
   Set this up via the Triggers panel (see setup step 7).
   Fires whenever any cell in the Listings sheet is edited.
   Only sends notifications when a City value is set/changed.
   ========================================================== */
function onListingChange(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== LISTINGS_SHEET) return;

  /* Find column positions by header name */
  var headers    = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var cityCol    = headers.indexOf('City');       /* 0-indexed */
  var statusCol  = headers.indexOf('Status');
  var nameCol    = headers.indexOf('Property Name');

  if (cityCol === -1) return; /* City column not found — nothing to do */

  /* Only proceed if the edit touched the City column */
  var editStartCol = e.range.getColumn() - 1;    /* convert to 0-indexed */
  var editEndCol   = editStartCol + e.range.getNumColumns() - 1;
  if (cityCol < editStartCol || cityCol > editEndCol) return;

  /* Process each edited row */
  var startRow = e.range.getRow();
  var numRows  = e.range.getNumRows();

  for (var r = 0; r < numRows; r++) {
    var rowIndex = startRow + r;
    if (rowIndex === 1) continue; /* skip header row */

    var rowData  = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    var city     = (rowData[cityCol]   || '').toString().trim();
    var status   = (rowData[statusCol] || 'Available').toString().trim();
    var propName = (rowData[nameCol]   || 'a new property').toString().trim();

    if (!city) continue; /* no city set — skip */

    notifyMatchingSubscribers(city, status, propName);
  }
}

/* ==========================================================
   notifyMatchingSubscribers
   Finds which region(s) a city belongs to, then emails
   all subscribers who selected any of those regions.
   ========================================================== */
function notifyMatchingSubscribers(city, status, propName) {
  var cityLower = city.toLowerCase();

  /* Find all matching regions for this city */
  var matchingRegions = [];
  for (var regionKey in REGION_CITIES) {
    var cities = REGION_CITIES[regionKey];
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      if (cityLower === c || cityLower.indexOf(c) !== -1 || c.indexOf(cityLower) !== -1) {
        matchingRegions.push(regionKey);
        break;
      }
    }
  }

  if (matchingRegions.length === 0) {
    Logger.log('City not matched to any region: ' + city);
    return;
  }

  /* Read all subscribers */
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SUBS_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; /* no subscribers yet */

  var data = sheet.getRange(2, 1, lastRow - 1, SUBS_COL_COUNT).getValues();

  for (var i = 0; i < data.length; i++) {
    var subEmail     = (data[i][COL_EMAIL - 1]      || '').toString().trim();
    var subFirstName = (data[i][COL_FIRST_NAME - 1] || '').toString().trim();
    var subRegions   = (data[i][COL_REGIONS - 1]    || '').toString().trim().split(',')
      .map(function (r) { return r.trim(); });

    if (!subEmail) continue;

    /* Check for any overlap between subscriber regions and matching regions */
    var hasMatch = subRegions.some(function (r) {
      return matchingRegions.indexOf(r) !== -1;
    });

    if (hasMatch) {
      /* Build friendly region names for the email */
      var regionLabels = subRegions
        .filter(function (r) { return matchingRegions.indexOf(r) !== -1; })
        .map(function (r) { return REGION_NAMES[r] || r; })
        .join(', ');

      sendNotificationEmail(subEmail, subFirstName, city, status, propName, regionLabels);
    }
  }
}

/* ==========================================================
   sendNotificationEmail
   Sends a branded HTML + plain-text notification email
   with a personalized greeting and one-click Unsubscribe.
   ========================================================== */
function sendNotificationEmail(toEmail, firstName, city, status, propName, regionLabel) {
  var greeting     = firstName ? 'Hi ' + firstName + ',' : 'Hi there,';
  var statusLower  = status.toLowerCase();
  var statusPhrase = (statusLower === 'coming soon') ? 'is coming soon' : 'is now available';
  var subject      = '\uD83C\uDFE1 New Listing Alert: ' + propName + ' in ' + city;
  var unsubUrl     = SCRIPT_URL + '?action=unsubscribe&email=' + encodeURIComponent(toEmail);

  /* Plain text fallback */
  var body =
    greeting + '\n\n'
    + 'Great news \u2014 a new listing in ' + city + ' that matches your interest in '
    + regionLabel + ' ' + statusPhrase + ':\n\n'
    + '\u2022 Property: ' + propName + '\n'
    + '\u2022 Location: ' + city + '\n'
    + '\u2022 Status:   ' + status + '\n\n'
    + 'Click below to view all current listings and start your free pre-screening:\n'
    + SITE_URL + '\n\n'
    + 'Pre-screening is always free \u2014 no credit check, no obligation.\n\n'
    + 'To unsubscribe from listing alerts, visit:\n' + unsubUrl + '\n\n'
    + '\u2014 ' + FROM_NAME + '\n'
    + 'We are not a lender. Pre-screening is informational only.';

  /* Branded HTML email */
  var htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">'
    + '<div style="background:#818b7e;padding:22px 32px;">'
    +   '<p style="color:#fff;margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CA Affordable Homes</p>'
    +   '<h1 style="color:#fff;margin:6px 0 0;font-size:22px;font-weight:600;">\uD83C\uDFE1 New Listing Alert</h1>'
    + '</div>'
    + '<div style="padding:32px;">'
    +   '<p style="color:#555;margin-top:0;">' + greeting + '<br>'
    +     'A new listing in <strong>' + city + '</strong> '
    +     'matching your interest in <strong>' + regionLabel + '</strong> ' + statusPhrase + ':</p>'
    +   '<div style="background:#f7f7f4;border-left:4px solid #818b7e;padding:18px 22px;margin:22px 0;border-radius:4px;">'
    +     '<p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#222;">' + propName + '</p>'
    +     '<p style="margin:0 0 10px;color:#666;font-size:14px;">'
    +       '<i style="margin-right:4px;">&#x1F4CD;</i>' + city
    +     '</p>'
    +     '<span style="display:inline-block;padding:3px 12px;background:#818b7e;color:#fff;border-radius:12px;font-size:13px;">'
    +       status
    +     '</span>'
    +   '</div>'
    +   '<a href="' + SITE_URL + '" style="display:inline-block;background:#818b7e;color:#fff;padding:13px 30px;'
    +     'text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;margin-top:4px;">'
    +     'View Listings &amp; Pre-Screen &rarr;'
    +   '</a>'
    +   '<p style="color:#555;margin-top:22px;font-size:14px;">'
    +     'Pre-screening is always <strong>free</strong> \u2014 no credit check, no obligation.'
    +   '</p>'
    +   '<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">'
    +   '<p style="color:#999;font-size:12px;margin:0 0 12px;">'
    +     'You received this because you signed up for listing alerts at CAAffordableHomes.com.<br>'
    +     'We are not a lender. Pre-screening is informational only.'
    +   '</p>'
    +   '<a href="' + unsubUrl + '" style="display:inline-block;padding:6px 18px;border:1.5px solid #ccc;'
    +     'color:#666;text-decoration:none;border-radius:4px;font-size:12px;font-family:Arial,sans-serif;">'
    +     'Unsubscribe'
    +   '</a>'
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
    Logger.log('Notification sent to: ' + toEmail + ' | Property: ' + propName);
  } catch (err) {
    Logger.log('Failed to send to ' + toEmail + ': ' + err.message);
  }
}

/* ==========================================================
   testNotify — run this manually to verify email formatting
   In Apps Script editor: select testNotify → click Run
   ========================================================== */
function testNotify() {
  sendNotificationEmail(
    Session.getActiveUser().getEmail(),
    'Alex',
    'El Cajon',
    'Available',
    'Sunset Ridge Townhomes',
    'East County'
  );
  Logger.log('Test email sent to your account.');
}

/* ==========================================================
   PHASE 5 — MATCHING ENGINE
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
    Logger.log('Requirements sheet not found. Create it and add headers first (see setup step 5c).');
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

  var reqData = reqSheet.getRange(2, 1, reqLastRow - 1, REQ_COLUMNS.length).getValues();
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
   Set up via Triggers panel (see setup step 7 / Trigger A).
   ========================================================== */
function onRequirementsEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== REQUIREMENTS_SHEET) return;

  var row = e.range.getRow();
  if (row === 1) return; /* header row — skip */

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

  /* 1 — Credit score
     All programs: minimum 640. Per-listing override via min_credit_score. */
  var minCredit = parseNum(req['min_credit_score'], 640);
  var apCredit  = parseCreditScoreLowerBound(ap['credit_score_range']);
  if (apCredit !== null && apCredit < minCredit) {
    failed.push('Credit score (' + ap['credit_score_range'] + ', need ' + minCredit + '+)');
  }

  /* 2 — First-time buyer / no prior ownership in last N years
     All programs: cannot have owned in last 3 years. */
  var ftbRequired   = yesNo(req['first_time_buyer_required'], 'yes');
  var ownershipYears = parseNum(req['no_ownership_years'], 3);
  if (ftbRequired) {
    var ownedRE = yesNo(ap['owned_real_estate']);
    if (ownedRE) {
      failed.push('Owned real estate in last ' + ownershipYears + ' years');
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

  /* 4 — Annual income vs. per-household-size maximum */
  var annualIncome = getApplicantIncome(ap);
  if (annualIncome !== null && hhSize !== null) {
    var sizeKey  = 'max_income_' + Math.min(Math.max(Math.round(hhSize), 1), 6) + 'person';
    var maxInc   = parseNum(req[sizeKey]);
    var minInc   = parseNum(req['min_income']);
    if (maxInc !== null && annualIncome > maxInc) {
      failed.push('Income too high ($' + fmt(annualIncome) + ', max $' + fmt(maxInc) + ')');
    }
    if (minInc !== null && annualIncome < minInc) {
      failed.push('Income too low ($' + fmt(annualIncome) + ', min $' + fmt(minInc) + ')');
    }
  }

  /* 5 — Monthly debt and DTI
     All programs: max DTI 45%. Per-listing override via max_dti_percent / max_monthly_debt. */
  var monthlyDebt = parseNum(ap['monthly_debt_payments']);
  if (monthlyDebt !== null) {
    var maxDebt = parseNum(req['max_monthly_debt']);
    if (maxDebt !== null && monthlyDebt > maxDebt) {
      failed.push('Monthly debt too high ($' + fmt(monthlyDebt) + '/mo, max $' + fmt(maxDebt) + ')');
    }
    /* DTI check */
    var maxDTI = parseNum(req['max_dti_percent'], 45);
    if (maxDTI !== null && annualIncome !== null && annualIncome > 0) {
      var dti = (monthlyDebt / (annualIncome / 12)) * 100;
      if (dti > maxDTI) {
        failed.push('DTI too high (' + Math.round(dti) + '%, max ' + maxDTI + '%)');
      }
    }
  }

  /* 6 — San Diego County residency / work history */
  var sdRequired     = yesNo(req['sd_county_residency_required'], 'yes');
  var sdMonthsReq    = parseNum(req['sd_residency_months'], 24);
  if (sdRequired) {
    if (sdMonthsReq >= 24) {
      if (!yesNo(ap['worked_lived_sd_2yr'])) {
        failed.push('SD County 2-year residency/work requirement not met');
      }
    } else {
      if (!yesNo(ap['live_in_sd_county'])) {
        failed.push('SD County residency required');
      }
    }
  }

  /* 7 — Household members living together */
  var togetherMonths = parseNum(req['household_together_months'], 12);
  if (togetherMonths >= 12) {
    if (!yesNo(ap['lived_together_12mo'])) {
      failed.push('Household not living together 12+ months');
    }
  }

  /* 8 — SDHC prior purchase */
  var sdhcAllowed = yesNo(req['sdhc_prior_purchase_allowed'], 'yes');
  if (!sdhcAllowed && yesNo(ap['sdhc_prior_purchase'])) {
    failed.push('Prior SDHC affordable program participation');
  }

  /* 9 — Foreclosure / short sale */
  if (yesNo(ap['foreclosure'])) {
    var fcAllowed  = yesNo(req['foreclosure_allowed'], 'yes');
    if (!fcAllowed) {
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
    var bkAllowed = yesNo(req['bankruptcy_allowed'], 'yes');
    if (!bkAllowed) {
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

  /* 11 — Judgments / garnishments / liens */
  var judgeAllowed = yesNo(req['judgments_allowed'], 'yes');
  if (!judgeAllowed && yesNo(ap['judgments'])) {
    failed.push('Outstanding judgments/garnishments/liens');
  }

  /* 12 — Citizenship / permanent residency */
  var citizenRequired = yesNo(req['citizenship_required'], 'yes');
  if (citizenRequired) {
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

  /* Build lookup of existing rows: "listing_id|email" → sheet row number */
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

  var subject = '[CA Affordable Homes] New candidates for ' + listingName;
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';

  /* Plain text */
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

  /* HTML */
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

/* ── Shared utility functions ── */

/* Convert a Requirements sheet data row to a keyed object */
function rowToReqObj(row) {
  var obj = {};
  for (var i = 0; i < REQ_COLUMNS.length; i++) {
    obj[REQ_COLUMNS[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
  }
  return obj;
}

/* Convert an Interest List sheet data row to a keyed object */
function rowToILObj(row) {
  var obj = {};
  for (var i = 0; i < IL_COLUMNS.length; i++) {
    obj[IL_COLUMNS[i]] = (row[i] !== undefined && row[i] !== null) ? row[i] : '';
  }
  return obj;
}

/* Parse a number from a cell value; returns defaultVal if blank, null if no default */
function parseNum(val, defaultVal) {
  if (val === '' || val === null || val === undefined) {
    return (defaultVal !== undefined) ? defaultVal : null;
  }
  var n = parseFloat(val.toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? (defaultVal !== undefined ? defaultVal : null) : n;
}

/* Interpret YES/NO cell values; defaultStr sets the assumed value when blank */
function yesNo(val, defaultStr) {
  var s = (val || '').toString().trim().toLowerCase();
  if (s === '') s = (defaultStr || 'no').toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

/* Parse the lower bound of a credit score range string */
function parseCreditScoreLowerBound(rangeStr) {
  if (!rangeStr) return null;
  var s = rangeStr.toString().trim().toLowerCase();
  if (s.indexOf('below') !== -1 || s.indexOf('under') !== -1) return 499;
  var match = s.match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : null;
}

/* Get best annual income figure from an applicant row object */
function getApplicantIncome(ap) {
  /* Primary: sum income member annual fields */
  var memberTotal    = 0;
  var hasMemberData  = false;
  for (var i = 1; i <= 6; i++) {
    var amt = parseNum(ap['income_' + i + '_annual']);
    if (amt !== null && amt > 0) { memberTotal += amt; hasMemberData = true; }
  }
  if (hasMemberData) return memberTotal;
  /* Fallback: 2024 tax return total */
  var t2024 = parseNum(ap['income_2024_total']);
  if (t2024 !== null && t2024 > 0) return t2024;
  /* Fallback: 2023 */
  var t2023 = parseNum(ap['income_2023_total']);
  if (t2023 !== null && t2023 > 0) return t2023;
  return null;
}

/* Sum all asset fields for an applicant */
function getApplicantTotalAssets(ap) {
  var fields  = ['asset_checking', 'asset_savings', 'asset_401k', 'asset_other'];
  var total   = 0;
  var hasAny  = false;
  for (var i = 0; i < fields.length; i++) {
    var v = parseNum(ap[fields[i]]);
    if (v !== null && v > 0) { total += v; hasAny = true; }
  }
  return hasAny ? total : null;
}

/* Calculate decimal years since a date value (string or Date) */
function yearsSinceValue(val) {
  if (!val) return null;
  var d = (val instanceof Date) ? val : new Date(val.toString());
  if (isNaN(d.getTime())) return null;
  return (new Date() - d) / (365.25 * 24 * 60 * 60 * 1000);
}

/* Format a number as a comma-separated integer string */
function fmt(n) {
  return Math.round(n).toLocaleString();
}

/* Escape HTML special characters for safe email output */
function escapeHtml(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
