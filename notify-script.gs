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
var LISTINGS_SHEET = 'Listings';
var SITE_URL       = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var SCRIPT_URL     = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';
var FROM_NAME      = 'CA Affordable Homes Team';
var REPLY_TO       = 'Info@CAAffordableHomes.com';

/* ── Matching configuration ── */
var REQUIREMENTS_SHEET  = 'Requirements';
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
  /* Tax-year income */
  'income_2022_total', 'income_2022_sched_c',
  'income_2023_total', 'income_2023_sched_c',
  'income_2024_total', 'income_2024_sched_c',
  'income_2025_total', 'income_2025_sched_c',
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
    var data     = JSON.parse(e.postData.contents);

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
  var reqSheet = ss.getSheetByName(REQUIREMENTS_SHEET);
  if (!reqSheet || reqSheet.getLastRow() < 2) {
    Logger.log('rebuildDashboard: no Requirements rows — skipping.');
    return;
  }
  var reqData        = reqSheet.getRange(2, 1, reqSheet.getLastRow() - 1, REQ_COLUMNS.length).getValues();
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

  /* ── Get address info from Listings tab ── */
  var addressMap   = {}; /* Property Name → "Address, City" */
  var listingsTab  = ss.getSheetByName(LISTINGS_SHEET);
  if (listingsTab && listingsTab.getLastRow() > 1) {
    var lData = listingsTab.getRange(2, 1, listingsTab.getLastRow() - 1, 3).getValues();
    for (var k = 0; k < lData.length; k++) {
      var pName = (lData[k][0] || '').toString().trim();
      var addr  = (lData[k][1] || '').toString().trim();
      var city  = (lData[k][2] || '').toString().trim();
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
