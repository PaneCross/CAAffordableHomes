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

   6. DEPLOY / UPDATE:
      - If first time: Click Deploy → New deployment → Web App
        Execute as: Me | Who has access: Anyone → Deploy → Authorize
      - If updating: Click Deploy → Manage deployments → Edit (pencil icon)
        Set Version to "New version" → Deploy
        The Web App URL stays the same — no need to update homes.html or contact.html

   7. SET UP THE EDIT TRIGGER (if not already done):
      - In the Apps Script editor, click the clock icon (Triggers) on the left
      - Click "+ Add Trigger" (bottom right)
      - Choose function: onListingChange
      - Event source: From spreadsheet
      - Event type: On edit
      - Click Save

   That's it! Subscriber sign-ups will appear in the "Subscribers" tab, and
   notification emails (with personalized greetings and an Unsubscribe button)
   will fire whenever you add or edit a listing's City field.

   ========================================================== */

/* ── Configuration ── */
var SPREADSHEET_ID  = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var LISTINGS_SHEET  = 'Listings';
var SUBS_SHEET      = 'Subscribers';
var SITE_URL        = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var SCRIPT_URL      = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';
var FROM_NAME       = 'CA Affordable Homes Team';
var REPLY_TO        = 'Info@CAAffordableHomes.com';

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
   doPost — Interest List questionnaire submission
   Called by the contact.html Interest List wizard via JSON POST.
   Writes one row to the "Interest List" sheet, deduplicates by
   email (updates existing active rows; inserts new ones), then
   sends a confirmation email to the applicant and a summary
   notification to the internal team.
   ========================================================== */
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
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
      to:      'tj@nostos.tech',
      subject: subject,
      body:    body,
      name:    FROM_NAME,
      replyTo: REPLY_TO
    });
    Logger.log('IL notification sent to tj@nostos.tech');
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
