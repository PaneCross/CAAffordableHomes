/* ==========================================================
   CA Affordable Homes — Admin Interface Script
   ==========================================================

   SETUP INSTRUCTIONS (one-time):

   1. Open your Google Sheet → Extensions → Apps Script
   2. In the left panel, click the "+" next to "Files"
   3. Choose "Script" and name it: admin-script
   4. Paste the ENTIRE contents of this file and Save (Ctrl+S)

   5. DEPLOY THE ADMIN WEB APP (separate from the existing deployment):
      - Click Deploy → New deployment
      - Type: Web App
      - Description: CA Affordable Homes Admin UI
      - Execute as: User accessing the web app   ← CRITICAL: must be this, NOT "Me"
      - Who has access: Anyone with Google account
      - Click Deploy → Authorize → Copy the new Web App URL

      WHY "User accessing the web app":
      With "Execute as: Me", Session.getActiveUser().getEmail() returns empty
      for visitors because they never go through OAuth consent. With "Execute as:
      User accessing the web app", Apps Script forces the OAuth consent screen on
      first visit, which is what makes getActiveUser() return the visitor's email.
      TJ and Kacee must both have edit access to the spreadsheet for this to work
      (they do, since it is Kacee's sheet and TJ has been granted access).

   6. GIVE THAT URL ONLY TO TJ AND KACEE — do not publish it publicly.
      Bookmark it. The URL format will be:
      https://script.google.com/macros/s/XXXXXXX.../exec

   7. KACEE'S EMAIL: replace KACEE_EMAIL_HERE below with her actual
      Google account email address before deploying.

   UPDATING: Any time you change this file, go to
   Deploy → Manage deployments → find "CA Affordable Homes Admin UI"
   → Edit (pencil) → Version: New version → Deploy.
   The URL stays the same.

   ========================================================== */

/* ── Admin Configuration ─────────────────────────────────── */
var ADMIN_EMAILS       = ['tj@nostos.tech', 'kcaffordablehomes@gmail.com'];
var OTP_EXPIRY_MIN     = 10;   /* OTP codes expire after this many minutes */
var SESSION_EXPIRY_HR  = 8;    /* OTP sessions last this many hours */

/* Shared sheet references (same spreadsheet as notify-script.gs) */
var ADMIN_SS_ID        = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var ADMIN_IL_SHEET     = 'Interest List';
var ADMIN_PS_SHEET     = 'Property Submissions';
var ADMIN_PROG_SHEET      = 'Programs';
var ADMIN_LISTINGS_SHEET  = 'Listings';
var ADMIN_DASH_SHEET   = 'Dashboard';

/* Master Listings sheet columns — must stay in sync with notify-script.gs LISTINGS_COLUMNS */
var LISTINGS_COLUMNS = [
  'listing_id','listing_name','active',
  'ami_percent','min_household_size','max_household_size',
  'max_income_1person','max_income_2person','max_income_3person',
  'max_income_4person','max_income_5person','max_income_6person',
  'min_income','min_credit_score','max_dti_percent','max_monthly_debt',
  'first_time_buyer_required','no_ownership_years',
  'sd_county_residency_required','sd_residency_months',
  'household_together_months','sdhc_prior_purchase_allowed',
  'foreclosure_allowed','foreclosure_min_years',
  'bankruptcy_allowed','bankruptcy_min_years',
  'judgments_allowed','citizenship_required','permanent_resident_acceptable',
  'min_assets','max_assets','min_down_payment_pct','max_down_payment_pct',
  'min_employment_months','program_notes',
  'address','city','price','bedrooms','bathrooms','sqft',
  'listing_type','program_type','internal_notes'
];

/* Programs sheet column headers — must match exactly */
var PROG_COLUMNS = [
  'Community Name', 'Area', 'Program Type', 'AMI Range',
  'Bedrooms', 'Household Size Limit', 'First-Time Buyer',
  'Price Range', 'Status', 'Notes'
];

/* ==========================================================
   doGet — serves the admin HTML or OTP login page
   ========================================================== */
function doGet(e) {
  var userEmail  = '';
  var authMethod = '';
  var token      = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';

  /* Get the deployed URL so we can pass it to the login page for the account-chooser link */
  var scriptUrl = '';
  try { scriptUrl = ScriptApp.getService().getUrl(); } catch (err) {}

  /* --- Google account auth --- */
  try {
    userEmail = Session.getActiveUser().getEmail();
  } catch (err) { userEmail = ''; }

  if (userEmail && ADMIN_EMAILS.indexOf(userEmail.toLowerCase()) > -1) {
    authMethod = 'google';
    return HtmlService
      .createHtmlOutput(buildAdminHTML(userEmail, 'google', ''))
      .setTitle('CA Affordable Homes Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  /* --- OTP session token in URL --- */
  if (token && adminTokenValid_(token)) {
    var td = adminTokenData_(token);
    return HtmlService
      .createHtmlOutput(buildAdminHTML(td.email, 'otp', token))
      .setTitle('CA Affordable Homes Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  /* --- Show login page (pass scriptUrl so the Google button can use AccountChooser) --- */
  return HtmlService
    .createHtmlOutput(buildLoginHTML(scriptUrl))
    .setTitle('CA Affordable Homes Admin — Sign In')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ==========================================================
   OTP Auth Functions
   (called from client via google.script.run)
   ========================================================== */

/* Request a one-time code — sends to email if it is in the allow-list */
function adminRequestOTP(email) {
  var clean = (email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.indexOf(clean) === -1) {
    return { ok: false, error: 'That email address is not authorized.' };
  }
  var code    = Math.floor(100000 + Math.random() * 900000).toString();
  var expiry  = new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000).toISOString();
  PropertiesService.getScriptProperties().setProperty(
    'otp_' + clean, JSON.stringify({ code: code, expiry: expiry })
  );
  try {
    MailApp.sendEmail({
      to:      clean,
      subject: 'CA Affordable Homes Admin — Your login code',
      body:    'Your one-time login code is: ' + code
             + '\n\nThis code expires in ' + OTP_EXPIRY_MIN + ' minutes.'
             + '\n\nIf you did not request this, ignore this email.'
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Could not send email: ' + err.message };
  }
}

/* Verify the OTP code — returns a session token on success */
function adminVerifyOTP(email, code) {
  var clean  = (email || '').trim().toLowerCase();
  var stored = PropertiesService.getScriptProperties().getProperty('otp_' + clean);
  if (!stored) return { ok: false, error: 'No code found. Please request a new one.' };

  var d = JSON.parse(stored);
  if (new Date(d.expiry) < new Date()) {
    PropertiesService.getScriptProperties().deleteProperty('otp_' + clean);
    return { ok: false, error: 'Code expired. Please request a new one.' };
  }
  if (d.code !== (code || '').trim()) {
    return { ok: false, error: 'Incorrect code. Please try again.' };
  }

  PropertiesService.getScriptProperties().deleteProperty('otp_' + clean);
  var token  = Utilities.getUuid();
  var expiry = new Date(Date.now() + SESSION_EXPIRY_HR * 3600 * 1000).toISOString();
  PropertiesService.getScriptProperties().setProperty(
    'ses_' + token, JSON.stringify({ email: clean, expiry: expiry })
  );
  return { ok: true, token: token };
}

/* Internal helpers */
function adminTokenValid_(token) {
  if (!token) return false;
  var s = PropertiesService.getScriptProperties().getProperty('ses_' + token);
  if (!s) return false;
  var d = JSON.parse(s);
  if (new Date(d.expiry) < new Date()) {
    PropertiesService.getScriptProperties().deleteProperty('ses_' + token);
    return false;
  }
  return true;
}
function adminTokenData_(token) {
  var s = PropertiesService.getScriptProperties().getProperty('ses_' + token);
  return s ? JSON.parse(s) : null;
}

/* Auth gate — every admin data function calls this first */
function requireAdmin_(token) {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  if (email && ADMIN_EMAILS.indexOf(email.toLowerCase()) > -1) {
    return { ok: true, email: email };
  }
  if (token && adminTokenValid_(token)) {
    return { ok: true, email: adminTokenData_(token).email };
  }
  return { ok: false, error: 'Unauthorized' };
}

/* ==========================================================
   ADMIN DATA — Dashboard
   ========================================================== */
function adminGetDashboard(token) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss = SpreadsheetApp.openById(ADMIN_SS_ID);
  var result = { ok: true, il: {}, ps: {}, programs: 0, lastMatch: '' };

  /* Interest List counts */
  var ilSheet = ss.getSheetByName(ADMIN_IL_SHEET);
  if (ilSheet && ilSheet.getLastRow() > 1) {
    var ilData = ilSheet.getRange(2, 1, ilSheet.getLastRow() - 1, ilSheet.getLastColumn()).getValues();
    var headers = ilSheet.getRange(1, 1, 1, ilSheet.getLastColumn()).getValues()[0];
    var statusIdx = headers.indexOf('status');
    var dateIdx   = headers.indexOf('submitted_at');
    var counts = { new: 0, reviewing: 0, active: 0, matched: 0, expired: 0, total: 0 };
    var recent = 0;
    var sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    ilData.forEach(function(row) {
      counts.total++;
      var s = (row[statusIdx] || '').toString().trim().toLowerCase();
      if (counts[s] !== undefined) counts[s]++;
      var d = row[dateIdx];
      if (d instanceof Date && d > sevenDaysAgo) recent++;
    });
    result.il = { counts: counts, recent7Days: recent };
  } else {
    result.il = { counts: { new:0, reviewing:0, active:0, matched:0, expired:0, total:0 }, recent7Days:0 };
  }

  /* Property submissions counts */
  var psSheet = ss.getSheetByName(ADMIN_PS_SHEET);
  if (psSheet && psSheet.getLastRow() > 1) {
    var psData    = psSheet.getRange(2, 1, psSheet.getLastRow() - 1, 2).getValues();
    var psCounts  = { new: 0, reviewing: 0, approved: 0, declined: 0, total: 0 };
    psData.forEach(function(row) {
      psCounts.total++;
      var s = (row[1] || '').toString().trim().toLowerCase();
      if (psCounts[s] !== undefined) psCounts[s]++;
    });
    result.ps = psCounts;
  } else {
    result.ps = { new:0, reviewing:0, approved:0, declined:0, total:0 };
  }

  /* Programs count */
  var progSheet = ss.getSheetByName(ADMIN_PROG_SHEET);
  result.programs = (progSheet && progSheet.getLastRow() > 1) ? progSheet.getLastRow() - 1 : 0;

  /* Last match run — read from Dashboard tab if it exists */
  var dashSheet = ss.getSheetByName(ADMIN_DASH_SHEET);
  if (dashSheet) {
    var dashVals = dashSheet.getDataRange().getValues();
    for (var i = 0; i < dashVals.length; i++) {
      if ((dashVals[i][0] || '').toString().indexOf('Last') > -1 && dashVals[i][1]) {
        result.lastMatch = dashVals[i][1].toString();
        break;
      }
    }
  }

  return result;
}

/* ==========================================================
   ADMIN DATA — Interest List
   ========================================================== */
function adminGetInterestList(token) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss      = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet   = ss.getSheetByName(ADMIN_IL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, rows: [], headers: [] };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  /* Serialize dates */
  var rows = data.map(function(row) {
    return row.map(function(cell) {
      if (cell instanceof Date) return cell.toISOString();
      return cell;
    });
  });

  return { ok: true, headers: headers, rows: rows };
}

/* Update a single applicant's status and/or add an internal note */
function adminUpdateApplicant(token, rowIndex, newStatus, note) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss      = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet   = ss.getSheetByName(ADMIN_IL_SHEET);
  if (!sheet) return { ok: false, error: 'Interest List sheet not found.' };

  var headers    = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusCol  = headers.indexOf('status') + 1;
  var updatedCol = headers.indexOf('updated_at') + 1;
  /* Use the last column for admin notes (add if missing) */
  var notesCol   = headers.indexOf('admin_notes') + 1;
  if (!notesCol) {
    notesCol = headers.length + 1;
    sheet.getRange(1, notesCol).setValue('admin_notes');
  }

  var sheetRow = rowIndex + 2; /* +2: 1 for header, 1 for 0-index */
  var now      = new Date();

  if (newStatus) sheet.getRange(sheetRow, statusCol).setValue(newStatus);
  if (updatedCol) sheet.getRange(sheetRow, updatedCol).setValue(now);
  if (note) {
    var existing = sheet.getRange(sheetRow, notesCol).getValue() || '';
    var stamp    = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.getRange(sheetRow, notesCol).setValue(
      existing ? existing + '\n[' + stamp + '] ' + note : '[' + stamp + '] ' + note
    );
  }
  return { ok: true };
}

/* Trigger a renewal reminder email for a specific applicant */
function adminSendRenewal(token, email, firstName) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    /* sendRenewalReminderEmail is defined in notify-script.gs and shares the same project */
    sendRenewalReminderEmail(email, firstName || '');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ==========================================================
   ADMIN DATA — Listings
   ========================================================== */
function adminGetListings(token) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = getOrCreateListingsSheet_(ss);
  if (sheet.getLastRow() < 2) return { ok: true, rows: [] };

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, LISTINGS_COLUMNS.length).getValues();
  var rows = data.map(function(row, i) {
    var obj = { _rowIndex: i };
    LISTINGS_COLUMNS.forEach(function(col, j) { obj[col] = row[j] !== undefined ? row[j] : ''; });
    return obj;
  });
  return { ok: true, rows: rows };
}

function adminSaveListing(token, listing) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = getOrCreateListingsSheet_(ss);
  var row   = LISTINGS_COLUMNS.map(function(col) { return listing[col] !== undefined ? listing[col] : ''; });

  if (typeof listing._rowIndex === 'number' && listing._rowIndex >= 0) {
    sheet.getRange(listing._rowIndex + 2, 1, 1, LISTINGS_COLUMNS.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { ok: true };
}

function adminDeleteListing(token, rowIndex) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = ss.getSheetByName(ADMIN_LISTINGS_SHEET);
  if (!sheet) return { ok: false, error: 'Listings sheet not found.' };

  sheet.deleteRow(rowIndex + 2);
  return { ok: true };
}

function getOrCreateListingsSheet_(ss) {
  var sheet = ss.getSheetByName(ADMIN_LISTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ADMIN_LISTINGS_SHEET);
    sheet.getRange(1, 1, 1, LISTINGS_COLUMNS.length).setValues([LISTINGS_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ==========================================================
   ADMIN DATA — Programs
   ========================================================== */
function adminGetPrograms(token) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = getOrCreateProgSheet_(ss);
  if (sheet.getLastRow() < 2) return { ok: true, rows: [] };

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, PROG_COLUMNS.length).getValues();
  var rows = data.map(function(row, i) {
    var obj = { _rowIndex: i };
    PROG_COLUMNS.forEach(function(col, j) { obj[col] = row[j]; });
    return obj;
  });
  return { ok: true, rows: rows };
}

/* Save (insert or update) a program row */
function adminSaveProgram(token, prog) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = getOrCreateProgSheet_(ss);

  var row = PROG_COLUMNS.map(function(col) { return prog[col] || ''; });

  if (typeof prog._rowIndex === 'number' && prog._rowIndex >= 0) {
    /* Update existing row */
    sheet.getRange(prog._rowIndex + 2, 1, 1, PROG_COLUMNS.length).setValues([row]);
  } else {
    /* Append new row */
    sheet.appendRow(row);
  }
  return { ok: true };
}

/* Delete a program row */
function adminDeleteProgram(token, rowIndex) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = ss.getSheetByName(ADMIN_PROG_SHEET);
  if (!sheet) return { ok: false, error: 'Programs sheet not found.' };

  sheet.deleteRow(rowIndex + 2);
  return { ok: true };
}

function getOrCreateProgSheet_(ss) {
  var sheet = ss.getSheetByName(ADMIN_PROG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ADMIN_PROG_SHEET);
    sheet.getRange(1, 1, 1, PROG_COLUMNS.length).setValues([PROG_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ==========================================================
   ADMIN DATA — Property Submissions
   ========================================================== */
function adminGetPropertySubmissions(token) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss    = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet = ss.getSheetByName(ADMIN_PS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, rows: [], headers: [] };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  var rows = data.map(function(row, i) {
    var obj = { _rowIndex: i };
    headers.forEach(function(h, j) {
      obj[h] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
    });
    return obj;
  });
  return { ok: true, headers: headers, rows: rows };
}

/* Update property submission status */
function adminUpdatePropertyStatus(token, rowIndex, newStatus) {
  var auth = requireAdmin_(token);
  if (!auth.ok) return { ok: false, error: auth.error };

  var ss      = SpreadsheetApp.openById(ADMIN_SS_ID);
  var sheet   = ss.getSheetByName(ADMIN_PS_SHEET);
  if (!sheet) return { ok: false, error: 'Property Submissions sheet not found.' };

  var headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusCol = headers.indexOf('status') + 1;
  if (!statusCol) return { ok: false, error: 'status column not found.' };

  sheet.getRange(rowIndex + 2, statusCol).setValue(newStatus);
  return { ok: true };
}

/* ==========================================================
   HTML — Login Page
   ========================================================== */
function buildLoginHTML(scriptUrl) {
  /* Build the Google AccountChooser URL so the user can pick any signed-in account.
     After selection Google redirects back to scriptUrl with that account active,
     and doGet will then see the correct Session.getActiveUser().getEmail(). */
  var accountChooserUrl = scriptUrl
    ? 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(scriptUrl)
    : '';

  return '<!DOCTYPE html><html lang="en"><head>'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<base target="_top">'
    + '<title>CA Affordable Homes Admin</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:"Inter",sans-serif;background:#f5f5f0;min-height:100vh;display:flex;align-items:center;justify-content:center;}'
    + '.login-card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);padding:2.5rem;width:100%;max-width:420px;}'
    + '.login-logo{font-size:1.05rem;font-weight:700;color:#2c5545;letter-spacing:.02em;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem;}'
    + '.login-logo i{font-size:1.3rem;}'
    + 'h1{font-size:1.4rem;font-weight:600;color:#1a1a1a;margin-bottom:.35rem;}'
    + '.login-sub{color:#777;font-size:.9rem;margin-bottom:1.75rem;}'
    + '.divider{display:flex;align-items:center;gap:.75rem;margin:1.25rem 0;color:#aaa;font-size:.8rem;}'
    + '.divider::before,.divider::after{content:"";flex:1;height:1px;background:#e5e5e0;}'
    + 'label{display:block;font-size:.82rem;font-weight:500;color:#444;margin-bottom:.3rem;}'
    + 'input{width:100%;padding:.65rem .85rem;border:1px solid #ddd;border-radius:7px;font-size:.9rem;font-family:inherit;outline:none;transition:border-color .15s;}'
    + 'input:focus{border-color:#2c5545;}'
    + '.btn-google{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.7rem;background:#fff;border:1.5px solid #ddd;border-radius:7px;font-size:.9rem;font-weight:500;cursor:pointer;color:#333;transition:background .15s;font-family:inherit;text-decoration:none;box-sizing:border-box;}'
    + '.btn-google:hover{background:#fafafa;}'
    + '.btn-primary{width:100%;padding:.7rem;background:#2c5545;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s;}'
    + '.btn-primary:hover{background:#3a6b59;}'
    + '.btn-primary:disabled{background:#9bb5ad;cursor:not-allowed;}'
    + '.form-group{margin-bottom:.9rem;}'
    + '.msg{font-size:.82rem;margin-top:.75rem;padding:.55rem .8rem;border-radius:6px;}'
    + '.msg-error{background:#fef0f0;color:#c0392b;}'
    + '.msg-ok{background:#edf7f0;color:#1e7d46;}'
    + '.otp-step{display:none;}'
    + '.link-btn{background:none;border:none;color:#2c5545;font-size:.82rem;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit;}'
    + '.google-note{font-size:.78rem;color:#999;margin-top:1rem;text-align:center;line-height:1.5;}'
    + '</style></head><body>'
    + '<div class="login-card">'
    + '  <div class="login-logo"><i class="fa-solid fa-house-chimney"></i> CA Affordable Homes</div>'
    + '  <h1>Admin Sign In</h1>'
    + '  <p class="login-sub">Restricted access. Authorized users only.</p>'

    /* Google sign-in — links through AccountChooser so any signed-in Google account
       can be selected, including secondary accounts in Chrome profiles. */
    + '  <a class="btn-google" href="' + accountChooserUrl + '" target="_top"'
    + (accountChooserUrl ? '' : ' onclick="alert(\'Admin URL not available yet — deploy the script first, then reload.\');return false;"')
    + '>'
    + '    <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>'
    + '    Sign in with Google'
    + '  </a>'
    + '  <p class="google-note">A Google account picker will open. Choose <strong>tj@nostos.tech</strong> or the authorized admin email.<br>You can switch accounts or add one from the picker.</p>'

    + '  <div class="divider">or use a one-time code</div>'

    /* OTP step 1 — email entry */
    + '  <div id="otp1">'
    + '    <div class="form-group">'
    + '      <label for="otp-email">Your authorized email address</label>'
    + '      <input type="email" id="otp-email" placeholder="you@example.com" autocomplete="email">'
    + '    </div>'
    + '    <button class="btn-primary" id="otp-send-btn" onclick="sendOTP()">Send One-Time Code</button>'
    + '    <div id="otp1-msg" class="msg" style="display:none"></div>'
    + '  </div>'

    /* OTP step 2 — code entry */
    + '  <div class="otp-step" id="otp2">'
    + '    <div class="form-group">'
    + '      <label for="otp-code">Enter the 6-digit code sent to <span id="otp-email-display"></span></label>'
    + '      <input type="text" id="otp-code" placeholder="123456" maxlength="6" inputmode="numeric" autocomplete="one-time-code">'
    + '    </div>'
    + '    <button class="btn-primary" id="otp-verify-btn" onclick="verifyOTP()">Sign In</button>'
    + '    <button class="link-btn" style="margin-top:.6rem;display:block;" onclick="resetOTP()">&#8592; Use a different email</button>'
    + '    <div id="otp2-msg" class="msg" style="display:none"></div>'
    + '  </div>'
    + '</div>'

    + '<script>'
    + 'function sendOTP(){'
    + '  var email=document.getElementById("otp-email").value.trim();'
    + '  if(!email){showMsg("otp1-msg","Please enter your email address.","error");return;}'
    + '  var btn=document.getElementById("otp-send-btn");'
    + '  btn.disabled=true;btn.textContent="Sending\u2026";'
    + '  google.script.run'
    + '    .withSuccessHandler(function(r){'
    + '      btn.disabled=false;btn.textContent="Send One-Time Code";'
    + '      if(r.ok){'
    + '        document.getElementById("otp1").style.display="none";'
    + '        document.getElementById("otp2").style.display="block";'
    + '        document.getElementById("otp-email-display").textContent=email;'
    + '      } else { showMsg("otp1-msg",r.error||"Failed to send code.","error"); }'
    + '    })'
    + '    .withFailureHandler(function(e){'
    + '      btn.disabled=false;btn.textContent="Send One-Time Code";'
    + '      showMsg("otp1-msg","An error occurred. Please try again.","error");'
    + '    })'
    + '    .adminRequestOTP(email);'
    + '}'
    + 'function verifyOTP(){'
    + '  var email=document.getElementById("otp-email").value.trim();'
    + '  var code=document.getElementById("otp-code").value.trim();'
    + '  if(!code){showMsg("otp2-msg","Please enter the code.","error");return;}'
    + '  var btn=document.getElementById("otp-verify-btn");'
    + '  btn.disabled=true;btn.textContent="Verifying\u2026";'
    + '  google.script.run'
    + '    .withSuccessHandler(function(r){'
    + '      if(r.ok){'
    + '        window.top.location.href=window.top.location.href.split("?")[0]+"?token="+r.token;'
    + '      } else {'
    + '        btn.disabled=false;btn.textContent="Sign In";'
    + '        showMsg("otp2-msg",r.error||"Invalid code.","error");'
    + '      }'
    + '    })'
    + '    .withFailureHandler(function(e){'
    + '      btn.disabled=false;btn.textContent="Sign In";'
    + '      showMsg("otp2-msg","An error occurred. Please try again.","error");'
    + '    })'
    + '    .adminVerifyOTP(email,code);'
    + '}'
    + 'function resetOTP(){'
    + '  document.getElementById("otp2").style.display="none";'
    + '  document.getElementById("otp1").style.display="block";'
    + '  document.getElementById("otp-code").value="";'
    + '}'
    + 'function showMsg(id,text,type){'
    + '  var el=document.getElementById(id);'
    + '  el.textContent=text;el.style.display="block";'
    + '  el.className="msg "+(type==="error"?"msg-error":"msg-ok");'
    + '}'
    + 'document.getElementById("otp-code").addEventListener("keydown",function(e){if(e.key==="Enter")verifyOTP();});'
    + 'document.getElementById("otp-email").addEventListener("keydown",function(e){if(e.key==="Enter")sendOTP();});'
    + '<\/script>'
    + '</body></html>';
}

/* ==========================================================
   HTML — Full Admin SPA
   ========================================================== */
function buildAdminHTML(userEmail, authMethod, token) {
  var tokenJS = JSON.stringify(token || '');
  var emailJS = JSON.stringify(userEmail || '');

  return '<!DOCTYPE html><html lang="en"><head>'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<base target="_top">'
    + '<title>CA Affordable Homes Admin</title>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
    + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">'
    + getAdminCSS_()
    + '</head><body>'
    + '<div id="app">'

    /* ── Sidebar ── */
    + '<aside class="sidebar" id="sidebar">'
    + '  <div class="sb-logo"><i class="fa-solid fa-house-chimney"></i><span>CA Affordable Homes</span></div>'
    + '  <nav class="sb-nav">'
    + '    <button class="sb-btn active" data-tab="dashboard"><i class="fa-solid fa-gauge"></i> Dashboard</button>'
    + '    <button class="sb-btn" data-tab="interest-list"><i class="fa-solid fa-list-check"></i> Interest List</button>'
    + '    <button class="sb-btn" data-tab="programs"><i class="fa-solid fa-building"></i> Programs</button>'
    + '    <button class="sb-btn" data-tab="properties"><i class="fa-solid fa-file-lines"></i> Property Submissions</button>'
    + '    <button class="sb-btn" data-tab="listings"><i class="fa-solid fa-house-chimney-window"></i> Listings</button>'
    + '  </nav>'
    + '  <div class="sb-user">'
    + '    <i class="fa-solid fa-circle-user"></i>'
    + '    <span id="sb-email-display"></span>'
    + '  </div>'
    + '</aside>'

    /* ── Main ── */
    + '<div class="main-wrap">'
    + '  <header class="top-bar">'
    + '    <button class="menu-btn" id="menu-toggle" aria-label="Toggle menu"><i class="fa-solid fa-bars"></i></button>'
    + '    <h1 class="top-title" id="top-title">Dashboard</h1>'
    + '    <div class="top-actions">'
    + '      <button class="btn-icon" id="refresh-btn" title="Refresh current view"><i class="fa-solid fa-rotate-right"></i></button>'
    + '    </div>'
    + '  </header>'

    /* ── Dashboard Tab ── */
    + '  <section class="tab-panel active" id="tab-dashboard">'
    + '    <div class="stat-grid" id="dash-stats"><div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div></div>'
    + '    <div class="dash-row" id="dash-bottom" style="display:none">'
    + '      <div class="card">'
    + '        <div class="card-header"><h3>Interest List Breakdown</h3></div>'
    + '        <div class="card-body" id="dash-il-detail"></div>'
    + '      </div>'
    + '      <div class="card">'
    + '        <div class="card-header"><h3>Property Submissions</h3></div>'
    + '        <div class="card-body" id="dash-ps-detail"></div>'
    + '      </div>'
    + '    </div>'
    + '  </section>'

    /* ── Interest List Tab ── */
    + '  <section class="tab-panel" id="tab-interest-list">'
    + '    <div class="toolbar">'
    + '      <input type="search" id="il-search" class="search-input" placeholder="Search by name, email\u2026">'
    + '      <select id="il-status-filter" class="select-input">'
    + '        <option value="">All statuses</option>'
    + '        <option value="new">New</option>'
    + '        <option value="reviewing">Reviewing</option>'
    + '        <option value="active">Active</option>'
    + '        <option value="matched">Matched</option>'
    + '        <option value="expired">Expired</option>'
    + '      </select>'
    + '    </div>'
    + '    <div class="table-wrap"><div id="il-table-area" class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div></div>'
    /* Detail drawer */
    + '    <div class="drawer" id="il-drawer" aria-hidden="true">'
    + '      <div class="drawer-inner">'
    + '        <div class="drawer-header">'
    + '          <h2 id="drawer-title">Applicant Profile</h2>'
    + '          <button class="drawer-close" id="drawer-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
    + '        </div>'
    + '        <div class="drawer-body" id="drawer-body"></div>'
    + '      </div>'
    + '    </div>'
    + '    <div class="drawer-overlay" id="drawer-overlay"></div>'
    + '  </section>'

    /* ── Programs Tab ── */
    + '  <section class="tab-panel" id="tab-programs">'
    + '    <div class="toolbar" style="flex-wrap:wrap;gap:.75rem;">'
    + '      <button class="btn-primary" id="prog-add-btn"><i class="fa-solid fa-plus"></i> Add Community</button>'
    + '      <div class="prog-filter-bar" id="prog-filter-bar">'
    + '        <button class="prog-filter-btn" data-pf="active">Active</button>'
    + '        <button class="prog-filter-btn" data-pf="available">Available Only</button>'
    + '        <button class="prog-filter-btn" data-pf="coming soon">Coming Soon Only</button>'
    + '        <button class="prog-filter-btn" data-pf="inactive">Inactive Only</button>'
    + '        <button class="prog-filter-btn" data-pf="all">All</button>'
    + '      </div>'
    + '    </div>'
    + '    <div id="prog-area"><div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div></div>'
    /* Program form modal */
    + '    <div class="modal-overlay" id="prog-modal" aria-hidden="true">'
    + '      <div class="modal-panel">'
    + '        <div class="modal-header">'
    + '          <h2 id="prog-modal-title">Add Community</h2>'
    + '          <button class="drawer-close" id="prog-modal-close"><i class="fa-solid fa-xmark"></i></button>'
    + '        </div>'
    + '        <div class="modal-body">'
    + '          <div class="form-row2"><div class="form-group"><label>Community Name *</label><input id="pf-name" class="form-input" placeholder="e.g. Hillside Commons"></div>'
    + '          <div class="form-group"><label>Area / City *</label><input id="pf-area" class="form-input" placeholder="e.g. Chula Vista"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Program Type</label><input id="pf-type" class="form-input" placeholder="e.g. City Affordable Housing"></div>'
    + '          <div class="form-group"><label>AMI Range</label><input id="pf-ami" class="form-input" placeholder="e.g. 80-120% AMI"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Bedrooms</label><input id="pf-beds" class="form-input" placeholder="e.g. 2-3 BR"></div>'
    + '          <div class="form-group"><label>Household Size Limit</label><input id="pf-hh" class="form-input" placeholder="e.g. Up to 4"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>First-Time Buyer</label>'
    + '            <select id="pf-ftb" class="form-input"><option value="">Select...</option><option>Required</option><option>Not Required</option></select></div>'
    + '          <div class="form-group"><label>Price Range</label><input id="pf-price" class="form-input" placeholder="e.g. Starting $350,000"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Status</label>'
    + '            <select id="pf-status" class="form-input"><option>Available</option><option>Coming Soon</option><option>Inactive</option></select></div>'
    + '          <div class="form-group"><label>Notes</label><input id="pf-notes" class="form-input" placeholder="Any special requirements\u2026"></div></div>'
    + '        </div>'
    + '        <div class="modal-footer">'
    + '          <button class="btn-secondary" id="prog-cancel-btn">Cancel</button>'
    + '          <button class="btn-primary" id="prog-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save Community</button>'
    + '        </div>'
    + '      </div>'
    + '    </div>'
    + '  </section>'

    /* ── Property Submissions Tab ── */
    + '  <section class="tab-panel" id="tab-properties">'
    + '    <div class="toolbar">'
    + '      <select id="ps-status-filter" class="select-input"><option value="">All statuses</option><option value="new">New</option><option value="reviewing">Reviewing</option><option value="approved">Approved</option><option value="declined">Declined</option></select>'
    + '    </div>'
    + '    <div class="table-wrap"><div id="ps-table-area" class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div></div>'
    /* Property detail drawer */
    + '    <div class="drawer" id="ps-drawer" aria-hidden="true">'
    + '      <div class="drawer-inner">'
    + '        <div class="drawer-header">'
    + '          <h2 id="ps-drawer-title">Property Submission</h2>'
    + '          <button class="drawer-close" id="ps-drawer-close"><i class="fa-solid fa-xmark"></i></button>'
    + '        </div>'
    + '        <div class="drawer-body" id="ps-drawer-body"></div>'
    + '      </div>'
    + '    </div>'
    + '    <div class="drawer-overlay" id="ps-drawer-overlay"></div>'
    + '  </section>'

    /* ── Listings Tab ── */
    + '  <section class="tab-panel" id="tab-listings">'
    + '    <div class="toolbar" style="flex-wrap:wrap;gap:.75rem;">'
    + '      <button class="btn-primary" id="lst-add-btn"><i class="fa-solid fa-plus"></i> Add Listing</button>'
    + '      <div class="prog-filter-bar" id="lst-filter-bar">'
    + '        <button class="prog-filter-btn" data-lf="active">Active</button>'
    + '        <button class="prog-filter-btn" data-lf="inactive">Inactive</button>'
    + '        <button class="prog-filter-btn" data-lf="all">All</button>'
    + '      </div>'
    + '    </div>'
    + '    <div id="lst-area"><div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div></div>'
    /* Listing form modal */
    + '    <div class="modal-overlay" id="lst-modal" aria-hidden="true">'
    + '      <div class="modal-panel" style="width:680px;">'
    + '        <div class="modal-header">'
    + '          <h2 id="lst-modal-title">Add Listing</h2>'
    + '          <button class="drawer-close" id="lst-modal-close"><i class="fa-solid fa-xmark"></i></button>'
    + '        </div>'
    + '        <div class="modal-body">'
    /* Section: Identity */
    + '          <p style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:.35rem;">Property Identity</p>'
    + '          <div class="form-row2"><div class="form-group"><label>Property ID / Name *</label><input id="lf-id" class="form-input" placeholder="e.g. Hillside Commons"></div>'
    + '          <div class="form-group"><label>Display Name (for emails)</label><input id="lf-name" class="form-input" placeholder="Same as ID if blank"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Active for Matching</label>'
    + '            <select id="lf-active" class="form-input"><option value="YES">YES</option><option value="NO">NO</option></select></div>'
    + '          <div class="form-group"><label>Listing Type</label>'
    + '            <select id="lf-type" class="form-input"><option value="affordable">Affordable</option><option value="mls">MLS</option></select></div></div>'
    /* Section: Property Info */
    + '          <p style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;margin:.6rem 0 .35rem;">Property Details</p>'
    + '          <div class="form-row2"><div class="form-group"><label>Address</label><input id="lf-address" class="form-input" placeholder="Street address"></div>'
    + '          <div class="form-group"><label>City</label><input id="lf-city" class="form-input" placeholder="e.g. San Diego"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Price</label><input id="lf-price" class="form-input" placeholder="e.g. $350,000"></div>'
    + '          <div class="form-group"><label>Program Type</label><input id="lf-program-type" class="form-input" placeholder="e.g. City Affordable Housing"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Bedrooms</label><input id="lf-beds" class="form-input" placeholder="e.g. 3"></div>'
    + '          <div class="form-group"><label>Bathrooms</label><input id="lf-baths" class="form-input" placeholder="e.g. 2"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Sqft</label><input id="lf-sqft" class="form-input" placeholder="e.g. 1200"></div>'
    + '          <div class="form-group"><label>AMI %</label><input id="lf-ami" class="form-input" placeholder="e.g. 80%"></div></div>'
    /* Section: Requirements */
    + '          <p style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;margin:.6rem 0 .35rem;">Matching Requirements</p>'
    + '          <div class="form-row2"><div class="form-group"><label>Min Credit Score</label><input id="lf-credit" class="form-input" placeholder="640"></div>'
    + '          <div class="form-group"><label>Max DTI %</label><input id="lf-dti" class="form-input" placeholder="45"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Max Monthly Debt</label><input id="lf-debt" class="form-input" placeholder="e.g. 2000"></div>'
    + '          <div class="form-group"><label>Min Household Size</label><input id="lf-minhh" class="form-input" placeholder="1"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Max Household Size</label><input id="lf-maxhh" class="form-input" placeholder="6"></div>'
    + '          <div class="form-group"><label>First-Time Buyer Required</label>'
    + '            <select id="lf-ftb" class="form-input"><option value="">Not specified</option><option value="YES">YES</option><option value="NO">NO</option></select></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>SD County Residency Required</label>'
    + '            <select id="lf-sdres" class="form-input"><option value="">Not specified</option><option value="YES">YES</option><option value="NO">NO</option></select></div>'
    + '          <div class="form-group"><label>Max Income (1-person household)</label><input id="lf-inc1" class="form-input" placeholder="e.g. 62000"></div></div>'
    + '          <div class="form-row2"><div class="form-group"><label>Max Income (4-person household)</label><input id="lf-inc4" class="form-input" placeholder="e.g. 88000"></div>'
    + '          <div class="form-group"><label>Max Income (6-person household)</label><input id="lf-inc6" class="form-input" placeholder="e.g. 105000"></div></div>'
    /* Section: Notes */
    + '          <p style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;margin:.6rem 0 .35rem;">Notes</p>'
    + '          <div class="form-group"><label>Program Notes (reference only — not used in matching)</label><input id="lf-prog-notes" class="form-input" placeholder="General notes about this program\u2026"></div>'
    + '          <div class="form-group"><label>Internal Notes</label><input id="lf-int-notes" class="form-input" placeholder="Internal admin notes\u2026"></div>'
    + '        </div>'
    + '        <div class="modal-footer">'
    + '          <button class="btn-secondary" id="lst-cancel-btn">Cancel</button>'
    + '          <button class="btn-primary" id="lst-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save Listing</button>'
    + '        </div>'
    + '      </div>'
    + '    </div>'
    /* Listing detail drawer */
    + '    <div class="drawer" id="lst-drawer" aria-hidden="true">'
    + '      <div class="drawer-inner">'
    + '        <div class="drawer-header">'
    + '          <h2 id="lst-drawer-title">Listing Details</h2>'
    + '          <button class="drawer-close" id="lst-drawer-close"><i class="fa-solid fa-xmark"></i></button>'
    + '        </div>'
    + '        <div class="drawer-body" id="lst-drawer-body"></div>'
    + '      </div>'
    + '    </div>'
    + '    <div class="drawer-overlay" id="lst-drawer-overlay"></div>'
    + '  </section>'

    + '</div></div>' /* /main-wrap /app */

    /* Toast notification */
    + '<div id="toast" class="toast" role="alert"></div>'

    + '<script>'
    + 'var SESSION_TOKEN=' + tokenJS + ';'
    + 'var USER_EMAIL=' + emailJS + ';'
    + 'var ilData=null, psData=null, progData=null;'
    + 'var editingProgRow=null;'
    + 'var ilSortCol=-1,ilSortDir=1,psSortCol=-1,psSortDir=1;'
    + 'var progFilterVal="active";'
    + getAdminJS_()
    + '<\/script>'
    + '</body></html>';
}

/* ==========================================================
   Admin CSS
   ========================================================== */
function getAdminCSS_() {
  return '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:"Inter",sans-serif;background:#f0f0eb;color:#1a1a1a;height:100vh;overflow:hidden;}'
    + '#app{display:flex;height:100vh;overflow:hidden;}'
    /* Sidebar */
    + '.sidebar{width:220px;background:#1e3a2f;color:#fff;display:flex;flex-direction:column;flex-shrink:0;transition:transform .25s;}'
    + '.sb-logo{padding:1.25rem 1rem;display:flex;align-items:center;gap:.5rem;font-size:.95rem;font-weight:700;color:#a8d5be;border-bottom:1px solid rgba(255,255,255,.08);}'
    + '.sb-logo i{font-size:1.1rem;}'
    + '.sb-nav{flex:1;padding:.75rem .5rem;display:flex;flex-direction:column;gap:.2rem;overflow-y:auto;}'
    + '.sb-btn{display:flex;align-items:center;gap:.65rem;padding:.65rem .85rem;border:none;background:none;color:rgba(255,255,255,.7);font-size:.875rem;font-family:inherit;border-radius:7px;cursor:pointer;text-align:left;transition:background .15s,color .15s;}'
    + '.sb-btn:hover{background:rgba(255,255,255,.08);color:#fff;}'
    + '.sb-btn.active{background:rgba(168,213,190,.15);color:#a8d5be;font-weight:600;}'
    + '.sb-btn i{width:16px;text-align:center;font-size:.9rem;}'
    + '.sb-user{padding:.85rem 1rem;border-top:1px solid rgba(255,255,255,.08);font-size:.75rem;color:rgba(255,255,255,.5);display:flex;align-items:center;gap:.5rem;word-break:break-all;}'
    /* Main */
    + '.main-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;}'
    + '.top-bar{background:#fff;border-bottom:1px solid #e5e5e0;padding:.75rem 1.5rem;display:flex;align-items:center;gap:1rem;flex-shrink:0;}'
    + '.menu-btn{background:none;border:none;font-size:1.1rem;cursor:pointer;color:#555;display:none;padding:.2rem;}'
    + '.top-title{font-size:1.1rem;font-weight:600;flex:1;}'
    + '.btn-icon{background:none;border:1px solid #ddd;border-radius:6px;padding:.4rem .6rem;cursor:pointer;color:#555;font-size:.9rem;transition:background .15s;}'
    + '.btn-icon:hover{background:#f5f5f0;}'
    /* Tab panels */
    + '.tab-panel{display:none;flex:1;overflow-y:auto;padding:1.5rem;flex-direction:column;gap:1.25rem;}'
    + '.tab-panel.active{display:flex;}'
    /* Stat grid */
    + '.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;}'
    + '.stat-card{background:#fff;border-radius:10px;padding:1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.06);}'
    + '.stat-card .stat-label{font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem;}'
    + '.stat-card .stat-value{font-size:2rem;font-weight:700;color:#1e3a2f;line-height:1;}'
    + '.stat-card .stat-sub{font-size:.78rem;color:#aaa;margin-top:.3rem;}'
    + '.stat-card.highlight .stat-value{color:#d97706;}'
    /* Dash bottom row */
    + '.dash-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}'
    + '.card{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:hidden;}'
    + '.card-header{padding:.85rem 1.1rem;border-bottom:1px solid #f0f0eb;}'
    + '.card-header h3{font-size:.9rem;font-weight:600;}'
    + '.card-body{padding:1rem 1.1rem;}'
    + '.status-row{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid #f5f5f0;font-size:.875rem;}'
    + '.status-row:last-child{border-bottom:none;}'
    + '.status-pill{display:inline-block;padding:.15rem .55rem;border-radius:12px;font-size:.72rem;font-weight:600;}'
    + '.pill-new{background:#dbeafe;color:#1e40af;}'
    + '.pill-reviewing{background:#fef9c3;color:#854d0e;}'
    + '.pill-active{background:#dcfce7;color:#166534;}'
    + '.pill-matched{background:#f3e8ff;color:#6b21a8;}'
    + '.pill-expired{background:#f1f5f9;color:#64748b;}'
    + '.pill-approved{background:#dcfce7;color:#166534;}'
    + '.pill-declined{background:#fee2e2;color:#991b1b;}'
    /* Toolbar */
    + '.toolbar{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;}'
    + '.search-input,.select-input{padding:.55rem .85rem;border:1px solid #ddd;border-radius:7px;font-size:.875rem;font-family:inherit;outline:none;}'
    + '.search-input{flex:1;min-width:200px;}'
    + '.search-input:focus,.select-input:focus{border-color:#2c5545;}'
    /* Tables */
    + '.table-wrap{background:#fff;border-radius:10px;overflow:auto;box-shadow:0 1px 4px rgba(0,0,0,.06);}'
    + 'table{width:100%;border-collapse:collapse;font-size:.85rem;}'
    + 'thead th{background:#f7f7f4;padding:.65rem 1rem;text-align:left;font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:#666;border-bottom:2px solid #e5e5e0;white-space:nowrap;}'
    + 'tbody tr{border-bottom:1px solid #f0f0eb;cursor:pointer;transition:background .1s;}'
    + 'tbody tr:hover{background:#f7f7f4;}'
    + 'tbody td{padding:.65rem 1rem;color:#333;}'
    + '.td-name{font-weight:500;}'
    + '.td-muted{color:#999;font-size:.8rem;}'
    /* Buttons */
    + '.btn-primary{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;background:#1e3a2f;color:#fff;border:none;border-radius:7px;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit;transition:background .15s;}'
    + '.btn-primary:hover{background:#2c5545;}'
    + '.btn-primary:disabled{background:#9bb5ad;cursor:not-allowed;}'
    + '.btn-secondary{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;background:#fff;color:#333;border:1.5px solid #ddd;border-radius:7px;font-size:.875rem;font-weight:500;cursor:pointer;font-family:inherit;transition:background .15s;}'
    + '.btn-secondary:hover{background:#f5f5f0;}'
    + '.btn-danger{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem .9rem;background:#fff;color:#c0392b;border:1.5px solid #f5c6c6;border-radius:7px;font-size:.8rem;font-weight:500;cursor:pointer;font-family:inherit;}'
    + '.btn-danger:hover{background:#fef0f0;}'
    + '.btn-sm{padding:.35rem .75rem;font-size:.78rem;}'
    /* Programs grid */
    + '.prog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;}'
    + '.prog-card{background:#fff;border-radius:10px;padding:1.1rem;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:.65rem;}'
    + '.prog-card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;}'
    + '.prog-card-name{font-weight:600;font-size:1.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.prog-card-area{font-size:.8rem;color:#888;margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.prog-card-body{display:flex;flex-direction:column;gap:.35rem;font-size:.82rem;}'
    + '.prog-detail{display:flex;justify-content:space-between;}'
    + '.prog-detail-label{color:#888;}'
    + '.prog-detail-value{font-weight:500;color:#333;}'
    + '.prog-card-footer{display:flex;gap:.5rem;padding-top:.5rem;border-top:1px solid #f0f0eb;justify-content:center;}'
    /* Drawer */
    + '.drawer{position:fixed;right:0;top:0;height:100%;width:480px;max-width:95vw;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .25s;z-index:200;display:flex;flex-direction:column;}'
    + '.drawer[aria-hidden="false"]{transform:translateX(0);}'
    + '.drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:199;display:none;}'
    + '.drawer-overlay.active{display:block;}'
    + '.drawer-inner{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;}'
    + '.drawer-header{padding:1.1rem 1.25rem;border-bottom:1px solid #f0f0eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}'
    + '.drawer-header h2{font-size:1rem;font-weight:600;}'
    + '.drawer-close{background:none;border:none;font-size:1.1rem;cursor:pointer;color:#888;padding:.25rem;border-radius:4px;}'
    + '.drawer-close:hover{background:#f5f5f0;color:#333;}'
    + '.drawer-body{flex:1;overflow-y:auto;padding:1.25rem;display:flex;flex-direction:column;gap:1rem;}'
    /* Drawer field groups */
    + '.field-group{border:1px solid #f0f0eb;border-radius:8px;overflow:hidden;}'
    + '.field-group-title{background:#f7f7f4;padding:.5rem .85rem;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#888;}'
    + '.field-row{display:flex;padding:.55rem .85rem;border-top:1px solid #f5f5f0;font-size:.84rem;}'
    + '.field-row:first-of-type{border-top:none;}'
    + '.field-label{color:#888;width:45%;flex-shrink:0;}'
    + '.field-value{color:#1a1a1a;font-weight:500;word-break:break-word;}'
    /* Status editor in drawer */
    + '.status-editor{display:flex;gap:.65rem;align-items:flex-end;flex-wrap:wrap;}'
    + '.status-editor select{flex:1;min-width:140px;padding:.55rem .75rem;border:1.5px solid #ddd;border-radius:7px;font-size:.875rem;font-family:inherit;outline:none;}'
    + '.status-editor select:focus{border-color:#2c5545;}'
    + '.notes-area{width:100%;padding:.6rem .85rem;border:1.5px solid #ddd;border-radius:7px;font-size:.85rem;font-family:inherit;resize:vertical;min-height:60px;outline:none;}'
    + '.notes-area:focus{border-color:#2c5545;}'
    /* Modal */
    + '.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;display:none;align-items:center;justify-content:center;}'
    + '.modal-overlay.open{display:flex;}'
    + '.modal-panel{background:#fff;border-radius:12px;width:600px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.18);}'
    + '.modal-header{padding:1.1rem 1.5rem;border-bottom:1px solid #f0f0eb;display:flex;align-items:center;justify-content:space-between;}'
    + '.modal-header h2{font-size:1rem;font-weight:600;}'
    + '.modal-body{padding:1.25rem 1.5rem;overflow-y:auto;display:flex;flex-direction:column;gap:.85rem;}'
    + '.modal-footer{padding:1rem 1.5rem;border-top:1px solid #f0f0eb;display:flex;justify-content:flex-end;gap:.75rem;}'
    + '.form-row2{display:grid;grid-template-columns:1fr 1fr;gap:.85rem;}'
    + '.form-group label{display:block;font-size:.8rem;font-weight:500;color:#555;margin-bottom:.3rem;}'
    + '.form-input{width:100%;padding:.6rem .8rem;border:1.5px solid #ddd;border-radius:7px;font-size:.875rem;font-family:inherit;outline:none;}'
    + '.form-input:focus{border-color:#2c5545;}'
    /* Loading / empty states */
    + '.loading-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem;gap:.75rem;color:#aaa;}'
    + '.loading-state i{font-size:2rem;color:#ccc;}'
    + '.loading-state p{font-size:.9rem;}'
    + '.empty-state{text-align:center;padding:3rem;color:#aaa;}'
    + '.empty-state i{font-size:2.5rem;display:block;margin-bottom:.75rem;color:#ddd;}'
    /* Toast */
    + '.toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(80px);background:#1e3a2f;color:#fff;padding:.7rem 1.3rem;border-radius:8px;font-size:.875rem;font-weight:500;opacity:0;transition:opacity .25s,transform .25s;z-index:400;pointer-events:none;}'
    + '.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}'
    + '.toast.error{background:#c0392b;}'
    /* File links */
    + '.file-link{display:block;color:#2c5545;font-size:.82rem;text-decoration:none;margin-bottom:.3rem;word-break:break-all;}'
    + '.file-link:hover{text-decoration:underline;}'
    /* Renewal btn */
    + '.renewal-row{background:#fef9c3;border:1px solid #fef08a;border-radius:8px;padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;font-size:.84rem;}'
    + '.prog-card--available{background:#f0faf5;}'
    + '.prog-card--soon{background:#fffceb;}'
    + '.prog-card--inactive{background:#f7f7f7;opacity:.85;}'
    + '.stat-card.clickable{cursor:pointer;transition:box-shadow .15s,transform .1s;}'
    + '.stat-card.clickable:hover{box-shadow:0 4px 14px rgba(0,0,0,.1);transform:translateY(-1px);}'
    + '.th-sort{cursor:pointer;user-select:none;}'
    + '.th-sort:hover{background:#eeeeea;color:#333;}'
    + '.sort-icon{margin-left:.3rem;opacity:.4;font-size:.7rem;}'
    + '.note-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#1e7d46;margin-left:.4rem;vertical-align:middle;}'
    + '.prog-filter-bar{display:flex;gap:.4rem;flex-wrap:wrap;}'
    + '.prog-filter-btn{padding:.35rem .75rem;border:1.5px solid #ddd;border-radius:20px;background:#fff;font-size:.8rem;font-family:inherit;cursor:pointer;transition:background .12s,border-color .12s;}'
    + '.prog-filter-btn.active{background:#1e3a2f;color:#fff;border-color:#1e3a2f;}'
    + '.prog-filter-btn:hover:not(.active){background:#f0faf5;border-color:#2c5545;}'
    + '.lst-card{background:#fff;border-radius:10px;padding:1.1rem 1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:.55rem;cursor:pointer;transition:box-shadow .15s;}'
    + '.lst-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.1);}'
    + '.lst-card--active{background:#f0faf5;}'
    + '.lst-card--inactive{background:#f7f7f7;opacity:.85;}'
    + '.lst-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;}'
    + '.lst-card-name{font-weight:700;font-size:1.0rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}'
    + '.lst-card-addr{font-size:.8rem;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.lst-card-meta{display:flex;flex-wrap:wrap;gap:.4rem .85rem;font-size:.8rem;color:#555;}'
    + '.lst-meta-item{display:flex;align-items:center;gap:.3rem;}'
    + '.lst-card-footer{display:flex;justify-content:flex-end;gap:.5rem;padding-top:.5rem;border-top:1px solid #f0f0eb;}'
    /* Responsive */
    + '@media(max-width:700px){'
    + '.sidebar{position:fixed;left:0;top:0;height:100%;z-index:150;transform:translateX(-100%);}'
    + '.sidebar.open{transform:translateX(0);}'
    + '.menu-btn{display:block;}'
    + '.dash-row{grid-template-columns:1fr;}'
    + '.form-row2{grid-template-columns:1fr;}'
    + '}'
    + '</style>';
}

/* ==========================================================
   Admin JavaScript (inline in the SPA)
   ========================================================== */
function getAdminJS_() {
  return ''

  /* ── Boot ── */
  + 'document.getElementById("sb-email-display").textContent=USER_EMAIL;'
  + 'loadDashboard();'

  /* ── Tab switching ── */
  + 'document.querySelectorAll(".sb-btn").forEach(function(btn){'
  + '  btn.addEventListener("click",function(){'
  + '    var tab=this.dataset.tab;'
  + '    document.querySelectorAll(".sb-btn").forEach(function(b){b.classList.remove("active");});'
  + '    this.classList.add("active");'
  + '    document.querySelectorAll(".tab-panel").forEach(function(p){p.classList.remove("active");});'
  + '    document.getElementById("tab-"+tab).classList.add("active");'
  + '    document.getElementById("top-title").textContent={'
  + '      "dashboard":"Dashboard","interest-list":"Interest List",'
  + '      "programs":"Programs","properties":"Property Submissions"'
  + '    }[tab];'
  + '    if(tab==="interest-list"&&!ilData)loadInterestList();'
  + '    if(tab==="programs"&&!progData)loadPrograms();'
  + '    if(tab==="properties"&&!psData)loadProperties();'
  + '    if(tab==="listings"&&!lstData)loadListings();'
  + '    /* close sidebar on mobile */'
  + '    document.getElementById("sidebar").classList.remove("open");'
  + '  });'
  + '});'

  /* ── Mobile menu ── */
  + 'document.getElementById("menu-toggle").addEventListener("click",function(){'
  + '  document.getElementById("sidebar").classList.toggle("open");'
  + '});'

  /* ── Refresh ── */
  + 'document.getElementById("refresh-btn").addEventListener("click",function(){'
  + '  var active=document.querySelector(".sb-btn.active").dataset.tab;'
  + '  if(active==="dashboard"){ilData=null;psData=null;progData=null;loadDashboard();}'
  + '  if(active==="interest-list"){ilData=null;loadInterestList();}'
  + '  if(active==="programs"){progData=null;loadPrograms();}'
  + '  if(active==="properties"){psData=null;loadProperties();}'
  + '  if(active==="listings"){lstData=null;loadListings();}'
  + '});'

  /* ── Toast ── */
  + 'function toast(msg,isError){'
  + '  var el=document.getElementById("toast");'
  + '  el.textContent=msg;el.className="toast"+(isError?" error":"");'
  + '  void el.offsetWidth;el.classList.add("show");'
  + '  setTimeout(function(){el.classList.remove("show");},3000);'
  + '}'

  /* ── Escape HTML ── */
  + 'function esc(s){if(!s&&s!==0)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}'

  /* ── Format date ── */
  + 'function fmtDate(v){if(!v)return"";var d=new Date(v);return isNaN(d)?v:d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}'

  /* ── Status pill ── */
  + 'function pill(s){var cls={"new":"pill-new","reviewing":"pill-reviewing","active":"pill-active","matched":"pill-matched","expired":"pill-expired","approved":"pill-approved","declined":"pill-declined"}[s.toLowerCase()]||"pill-expired";return\'<span class="status-pill \'+cls+\'">\'+esc(s)+\'</span>\';}'

  /* =====================================================
     DASHBOARD
     ===================================================== */
  + 'function loadDashboard(){'
  + '  document.getElementById("dash-stats").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div>\';'
  + '  document.getElementById("dash-bottom").style.display="none";'
  + '  google.script.run'
  + '    .withSuccessHandler(renderDashboard)'
  + '    .withFailureHandler(function(e){document.getElementById("dash-stats").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load dashboard. \'+esc(e.message||"")+\'</p></div>\';;})'
  + '    .adminGetDashboard(SESSION_TOKEN);'
  + '}'
  + 'function renderDashboard(d){'
  + '  if(!d||!d.ok){document.getElementById("dash-stats").innerHTML=\'<div class="loading-state"><p>\'+esc(d&&d.error||"Error")+\'</p></div>\';return;}'
  + '  var il=d.il.counts;var ps=d.ps;'
  + '  var sc=il,ps2=ps,rc=d.il.recent7Days,pc=d.programs;'
  + '  document.getElementById("dash-stats").innerHTML='
  + '    \'<div class="stat-card clickable" data-nav="il:" title="View all applicants"><div class="stat-label">Total Applicants</div><div class="stat-value">\'+sc.total+\'</div><div class="stat-sub">View all \u2192</div></div>\''
  + '   +\'<div class="stat-card highlight clickable" data-nav="il:new" title="Review new applicants"><div class="stat-label">Needs Review</div><div class="stat-value">\'+sc.new+\'</div><div class="stat-sub">Review now \u2192</div></div>\''
  + '   +\'<div class="stat-card clickable" data-nav="il:active"><div class="stat-label">Active</div><div class="stat-value">\'+sc.active+\'</div><div class="stat-sub">View active \u2192</div></div>\''
  + '   +\'<div class="stat-card clickable" data-nav="il:matched"><div class="stat-label">Matched</div><div class="stat-value">\'+sc.matched+\'</div><div class="stat-sub">View matched \u2192</div></div>\''
  + '   +\'<div class="stat-card clickable" data-nav="il:"><div class="stat-label">New (7 days)</div><div class="stat-value">\'+rc+\'</div><div class="stat-sub">View list \u2192</div></div>\''
  + '   +\'<div class="stat-card \'+( ps2.new>0?"highlight":"")+\' clickable" data-nav="ps:new"><div class="stat-label">Property Queue</div><div class="stat-value">\'+ps2.new+\'</div><div class="stat-sub">Review queue \u2192</div></div>\''
  + '   +\'<div class="stat-card clickable" data-nav="prog:"><div class="stat-label">Programs</div><div class="stat-value">\'+pc+\'</div><div class="stat-sub">Manage \u2192</div></div>\';'
  + '  document.querySelectorAll("#dash-stats .clickable[data-nav]").forEach(function(el){'
  + '    el.addEventListener("click",function(){'
  + '      var nav=(this.dataset.nav||"").split(":");'
  + '      var t=nav[0],f=nav[1]||"";'
  + '      if(t==="il")switchToTab("interest-list",f);'
  + '      else if(t==="ps")switchToTab("properties",f);'
  + '      else if(t==="prog")switchToTab("programs","");'
  + '    });'
  + '  });'
  + '  var ilDetail=["new","reviewing","active","matched","expired"].map(function(s){return\'<div class="status-row"><span>\'+s.charAt(0).toUpperCase()+s.slice(1)+\'</span>\'+pill(s)+\'<strong>\'+il[s]+\'</strong></div>\';}).join("");'
  + '  document.getElementById("dash-il-detail").innerHTML=ilDetail;'
  + '  var psDetail=["new","reviewing","approved","declined"].map(function(s){return\'<div class="status-row"><span>\'+s.charAt(0).toUpperCase()+s.slice(1)+\'</span>\'+pill(s)+\'<strong>\'+ps[s]+\'</strong></div>\';}).join("");'
  + '  document.getElementById("dash-ps-detail").innerHTML=psDetail;'
  + '  document.getElementById("dash-bottom").style.display="grid";'
  + '}'

  /* =====================================================
     NAVIGATION HELPER
     ===================================================== */
  + 'function switchToTab(tab,statusF){'
  + '  document.querySelectorAll(".sb-btn").forEach(function(b){b.classList.remove("active");});'
  + '  var btn=document.querySelector(\'.sb-btn[data-tab="\'+tab+\'"]\');'
  + '  if(btn)btn.classList.add("active");'
  + '  document.querySelectorAll(".tab-panel").forEach(function(p){p.classList.remove("active");});'
  + '  document.getElementById("tab-"+tab).classList.add("active");'
  + '  var titles={"dashboard":"Dashboard","interest-list":"Interest List","programs":"Programs","properties":"Property Submissions","listings":"Listings"};'
  + '  document.getElementById("top-title").textContent=titles[tab]||tab;'
  + '  if(typeof statusF==="string"){'
  + '    if(tab==="interest-list"){document.getElementById("il-status-filter").value=statusF;}'
  + '    if(tab==="properties"){document.getElementById("ps-status-filter").value=statusF;}'
  + '  }'
  + '  if(tab==="interest-list"){if(!ilData)loadInterestList();else renderILTable(ilData);}'
  + '  if(tab==="programs"){if(!progData)loadPrograms();}'
  + '  if(tab==="properties"){if(!psData)loadProperties();else renderPSTable(psData);}'
  + '  if(tab==="listings"){if(!lstData)loadListings();else renderListings(lstData);}'
  + '  document.getElementById("sidebar").classList.remove("open");'
  + '}'

  /* =====================================================
     INTEREST LIST
     ===================================================== */
  + 'function loadInterestList(){'
  + '  document.getElementById("il-table-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div>\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(d){ilData=d;renderILTable(d);})'
  + '    .withFailureHandler(function(e){document.getElementById("il-table-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>\'+esc(e.message||"Error")+\'</p></div>\';;})'
  + '    .adminGetInterestList(SESSION_TOKEN);'
  + '}'

  + 'function renderILTable(d){'
  + '  if(!d||!d.ok||!d.rows||d.rows.length===0){document.getElementById("il-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No applicants yet.</p></div>\';return;}'
  + '  var h=d.headers;'
  + '  var ni=h.indexOf("full_name"),ei=h.indexOf("email"),'
  + '      si=h.indexOf("status"),di=h.indexOf("submitted_at"),ai=h.indexOf("area_preference"),'
  + '      hhi=h.indexOf("household_size"),csi=h.indexOf("credit_score_self"),noti=h.indexOf("admin_notes");'
  + '  var search=(document.getElementById("il-search").value||"").toLowerCase();'
  + '  var statusF=(document.getElementById("il-status-filter").value||"").toLowerCase();'
  + '  var rows=d.rows.filter(function(r){'
  + '    var match=!search||(r[ni]||"").toLowerCase().indexOf(search)>-1||(r[ei]||"").toLowerCase().indexOf(search)>-1;'
  + '    var st=!statusF||(r[si]||"").toLowerCase()===statusF;'
  + '    return match&&st;'
  + '  });'
  + '  if(ilSortCol>=0){'
  + '    var colMap=[ni,ei,si,di,hhi,csi,ai];'
  + '    var sc=colMap[ilSortCol];'
  + '    rows=rows.slice().sort(function(a,b){'
  + '      var av=String(a[sc]||"").toLowerCase(),bv=String(b[sc]||"").toLowerCase();'
  + '      return av<bv?-ilSortDir:av>bv?ilSortDir:0;'
  + '    });'
  + '  }'
  + '  if(!rows.length){document.getElementById("il-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No results match your filter.</p></div>\';return;}'
  + '  var colNames=["Name","Email","Status","Submitted","Household","Credit","Area"];'
  + '  var thead=\'<thead><tr>\'+colNames.map(function(c,i){'
  + '    var icon=ilSortCol===i?(ilSortDir===1?\'\u25b4\':\'\u25be\'):\'\u25b4\u25be\';'
  + '    return\'<th class="th-sort" onclick="ilSort(\'+i+\')">\'+c+\' <span class="sort-icon">\'+icon+\'</span></th>\';'
  + '  }).join("")+\'</tr></thead>\';'
  + '  var html=\'<table>\'+thead+\'<tbody>\';'
  + '  rows.forEach(function(r){'
  + '    var origIdx=d.rows.indexOf(r);'
  + '    var hasNote=noti>=0&&String(r[noti]||"").trim().length>0;'
  + '    html+=\'<tr onclick="openILDrawer(\'+origIdx+\')">\''
  + '       +\'<td class="td-name">\'+esc(r[ni]||"")+(hasNote?\'<span class="note-dot" title="Has internal notes"></span>\':"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[ei]||"")+\'</td>\''
  + '       +\'<td>\'+pill(r[si]||"new")+\'</td>\''
  + '       +\'<td class="td-muted">\'+fmtDate(r[di])+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[hhi]||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[csi]||"")+\'</td>\''
  + '       +\'<td class="td-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\'+esc(r[ai]||"")+\'</td>\''
  + '       +\'</tr>\';'
  + '  });'
  + '  html+=\'</tbody></table>\';'
  + '  document.getElementById("il-table-area").innerHTML=html;'
  + '}'
  + 'function ilSort(col){if(ilSortCol===col){ilSortDir*=-1;}else{ilSortCol=col;ilSortDir=1;}if(ilData)renderILTable(ilData);}'

  /* Search/filter listeners */
  + 'document.getElementById("il-search").addEventListener("input",function(){if(ilData)renderILTable(ilData);});'
  + 'document.getElementById("il-status-filter").addEventListener("change",function(){if(ilData)renderILTable(ilData);});'

  /* Drawer open */
  + 'function openILDrawer(idx){'
  + '  if(!ilData)return;'
  + '  var h=ilData.headers,r=ilData.rows[idx];'
  + '  var ni=h.indexOf("full_name"),ei=h.indexOf("email"),pi=h.indexOf("phone"),si=h.indexOf("status");'
  + '  var firstName=(r[ni]||"").split(" ")[0];'
  + '  document.getElementById("drawer-title").textContent=r[ni]||"Applicant";'

  /* Build profile sections */
  + '  var sections=['
  + '    {title:"Personal",fields:["full_name","phone","email","household_size","credit_score_self","credit_score_coborrower","monthly_rent","area_preference","agent_yn"]},'
  + '    {title:"Household",fields:["lived_together_12mo","live_in_sd_county","worked_lived_sd_2yr","sdhc_prior_purchase","owned_real_estate","us_citizen","permanent_resident"]},'
  + '    {title:"Income",fields:["tax_year_labels","tax_1_total","tax_2_total","tax_3_total","income_1_name","income_1_annual","income_2_name","income_2_annual","income_3_name","income_3_annual"]},'
  + '    {title:"Financial",fields:["monthly_debt_payments","asset_checking","asset_savings","asset_401k","asset_other","foreclosure","bankruptcy","judgments"]},'
  + '    {title:"Status & Notes",fields:["status","submitted_at","updated_at","renewal_reminder_sent","additional_info","admin_notes"]}'
  + '  ];'
  + '  var body=\'<div class="renewal-row"><span><i class="fa-solid fa-envelope" style="color:#854d0e;margin-right:.4rem;"></i>Send renewal reminder to \'+esc(r[ei]||"")+\'</span><button class="btn-secondary btn-sm" onclick="sendRenewal(\'+idx+\',\\\'\'+esc(r[ei]||"")+\'\\\',\\\'\'+esc(firstName)+\'\\\')">Send Reminder</button></div>\';'
  /* Status editor */
  + '  body+=\'<div><div class="field-group-title" style="border-radius:8px 8px 0 0;border:1px solid #f0f0eb;border-bottom:none;padding:.5rem .85rem;">Update Status</div>\''
  + '  +\'<div style="border:1px solid #f0f0eb;border-radius:0 0 8px 8px;padding:.85rem;">\''
  + '  +\'<div class="status-editor"><select id="il-status-select"><option value="new">New</option><option value="reviewing">Reviewing</option><option value="active">Active</option><option value="matched">Matched</option><option value="expired">Expired</option></select>\''
  + '  +\'<button class="btn-primary btn-sm" onclick="saveILStatus(\'+idx+\')"><i class="fa-solid fa-check"></i> Save Status</button></div>\''
  + '  +\'<textarea class="notes-area" id="il-note-input" placeholder="Add an internal note (optional)\u2026" style="margin-top:.65rem;"></textarea>\''
  + '  +\'</div></div>\';'
  /* Field groups */
  + '  sections.forEach(function(sec){'
  + '    var rows="";'
  + '    sec.fields.forEach(function(f){'
  + '      var idx2=h.indexOf(f);'
  + '      if(idx2===-1)return;'
  + '      var v=r[idx2];'
  + '      if(!v&&v!==0)return;'
  + '      var label=f.replace(/_/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();});'
  + '      var val=f.indexOf("_at")>-1?fmtDate(v):f==="admin_notes"?\'<span style="white-space:pre-wrap">\'+esc(v)+\'</span>\':esc(v);'
  + '      rows+=\'<div class="field-row"><span class="field-label">\'+esc(label)+\'</span><span class="field-value">\'+val+\'</span></div>\';'
  + '    });'
  + '    if(rows)body+=\'<div class="field-group"><div class="field-group-title">\'+esc(sec.title)+\'</div>\'+rows+\'</div>\';'
  + '  });'
  + '  document.getElementById("drawer-body").innerHTML=body;'
  /* Set current status in dropdown */
  + '  document.getElementById("il-status-select").value=r[si]||"new";'
  /* Open drawer */
  + '  var drawer=document.getElementById("il-drawer");'
  + '  drawer.setAttribute("aria-hidden","false");'
  + '  document.getElementById("drawer-overlay").classList.add("active");'
  + '  drawer._rowIdx=idx;'
  + '}'

  + 'document.getElementById("drawer-close").addEventListener("click",closeILDrawer);'
  + 'document.getElementById("drawer-overlay").addEventListener("click",closeILDrawer);'
  + 'function closeILDrawer(){document.getElementById("il-drawer").setAttribute("aria-hidden","true");document.getElementById("drawer-overlay").classList.remove("active");}'

  /* Save status */
  + 'function saveILStatus(idx){'
  + '  var newStatus=document.getElementById("il-status-select").value;'
  + '  var note=document.getElementById("il-note-input").value.trim();'
  + '  var btn=document.querySelector(\'[onclick="saveILStatus(\'+idx+\')"]\');'
  + '  if(btn){btn.disabled=true;btn.innerHTML=\'<i class="fa-solid fa-circle-notch fa-spin"></i> Saving\u2026\';}'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){'
  + '      if(btn){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-check"></i> Save Status\';}'
  + '      if(r&&r.ok){'
  + '        toast("Status updated successfully.");'
  + '        ilData.rows[idx][ilData.headers.indexOf("status")]=newStatus;'
  + '        var noteVal=document.getElementById("il-note-input").value.trim();'
  + '        if(noteVal){'
  + '          var ni2=ilData.headers.indexOf("admin_notes");'
  + '          if(ni2===-1){ilData.headers.push("admin_notes");ni2=ilData.headers.length-1;ilData.rows.forEach(function(row){row.push("");});}'
  + '          var existing=String(ilData.rows[idx][ni2]||"");'
  + '          var now=new Date();var stamp=(now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0")+" "+String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0"));'
  + '          ilData.rows[idx][ni2]=existing?(existing+"\\n["+stamp+"] "+noteVal):("["+stamp+"] "+noteVal);'
  + '        }'
  + '        renderILTable(ilData);'
  + '        document.getElementById("il-note-input").value="";'
  + '        /* Re-open drawer so admin_notes are immediately visible */'
  + '        openILDrawer(idx);'
  + '      } else { toast((r&&r.error)||"Failed to save.",true); }'
  + '    })'
  + '    .withFailureHandler(function(e){if(btn){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-check"></i> Save Status\';}toast("Error: "+(e.message||"unknown"),true);})'
  + '    .adminUpdateApplicant(SESSION_TOKEN,idx,newStatus,note);'
  + '}'

  /* Send renewal */
  + 'function sendRenewal(idx,email,firstName){'
  + '  if(!confirm("Send renewal reminder email to "+email+"?"))return;'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){toast(r&&r.ok?"Renewal email sent.":"Failed: "+(r&&r.error||""),!(r&&r.ok));})'
  + '    .withFailureHandler(function(e){toast("Error: "+(e.message||"unknown"),true);})'
  + '    .adminSendRenewal(SESSION_TOKEN,email,firstName);'
  + '}'

  /* =====================================================
     PROGRAMS
     ===================================================== */
  + 'function loadPrograms(){'
  + '  document.getElementById("prog-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div>\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(d){progData=d;renderPrograms(d);})'
  + '    .withFailureHandler(function(e){document.getElementById("prog-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>\'+esc(e.message||"Error")+\'</p></div>\';;})'
  + '    .adminGetPrograms(SESSION_TOKEN);'
  + '}'

  + 'function renderPrograms(d){'
  + '  if(!d||!d.ok){document.getElementById("prog-area").innerHTML=\'<div class="empty-state"><p>\'+esc(d&&d.error||"Error")+\'</p></div>\';return;}'
  + '  if(!d.rows||d.rows.length===0){document.getElementById("prog-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-building"></i><p>No communities yet. Click "Add Community" to get started.</p></div>\';return;}'
  + '  /* Apply filter */'
  + '  var visible=d.rows.filter(function(prog,i){prog._displayIdx=i;'
  + '    var s=(prog["Status"]||"").toLowerCase();'
  + '    if(progFilterVal==="all")return true;'
  + '    if(progFilterVal==="active")return s==="available"||s==="coming soon";'
  + '    if(progFilterVal==="inactive")return s==="inactive";'
  + '    return s===progFilterVal;'
  + '  });'
  + '  /* Highlight active filter button */'
  + '  document.querySelectorAll(".prog-filter-btn").forEach(function(b){b.classList.toggle("active",b.dataset.pf===progFilterVal);});'
  + '  if(!visible.length){document.getElementById("prog-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-filter"></i><p>No communities match this filter.</p></div>\';return;}'
  + '  var html=\'<div class="prog-grid">\';'
  + '  visible.forEach(function(prog){'
  + '    var i=prog._displayIdx;'
  + '    var status=(prog["Status"]||"").toLowerCase();'
  + '    var badgeCls=status==="available"?"pill-active":status==="coming soon"?"pill-reviewing":"pill-expired";'
  + '    var bgCls=status==="available"?"prog-card--available":status==="coming soon"?"prog-card--soon":"prog-card--inactive";'
  + '    html+=\'<div class="prog-card \'+bgCls+\'">\''
  + '       +\'<div class="prog-card-header"><div style="min-width:0;flex:1;">'
  + '          <div class="prog-card-name" title="\'+esc(prog["Community Name"]||"Unnamed")+\'">\'+esc(prog["Community Name"]||"Unnamed")+\'</div>'
  + '          <div class="prog-card-area"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.75rem;margin-right:.3rem;"></i>\'+esc(prog["Area"]||"")+\'</div>'
  + '         </div><span class="status-pill \'+badgeCls+\'" style="flex-shrink:0;">\'+esc(prog["Status"]||"")+\'</span></div>\''
  + '       +\'<div class="prog-card-body">\';'
  + '    [["Program Type","fa-building"],["AMI Range","fa-chart-bar"],["Bedrooms","fa-bed"],["First-Time Buyer","fa-house"],["Price Range","fa-tag"]].forEach(function(f){'
  + '      if(prog[f[0]])html+=\'<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid \'+f[1]+\'" style="width:14px;color:#888;margin-right:.3rem;"></i>\'+esc(f[0])+\'</span><span class="prog-detail-value">\'+esc(prog[f[0]])+\'</span></div>\';'
  + '    });'
  + '    if(prog["Notes"])html+=\'<div style="font-size:.78rem;color:#888;background:rgba(0,0,0,.04);border-radius:6px;padding:.45rem .6rem;margin-top:.2rem;">\'+esc(prog["Notes"])+\'</div>\';'
  + '    html+=\'</div><div class="prog-card-footer"><button class="btn-secondary btn-sm" onclick="editProg(\'+i+\')"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn-danger btn-sm" onclick="deleteProg(\'+i+\')"><i class="fa-solid fa-trash"></i> Delete</button></div>\''
  + '       +\'</div>\';'
  + '  });'
  + '  html+=\'</div>\';'
  + '  document.getElementById("prog-area").innerHTML=html;'
  + '}'

  /* Add / edit program modal */
  + 'document.getElementById("prog-add-btn").addEventListener("click",function(){openProgModal(null);});'
  + 'document.getElementById("prog-filter-bar").addEventListener("click",function(e){'
  + '  var btn=e.target.closest(".prog-filter-btn");'
  + '  if(!btn)return;'
  + '  progFilterVal=btn.dataset.pf||"active";'
  + '  if(progData)renderPrograms(progData);'
  + '});'
  + '/* Set initial active filter button */'
  + 'document.querySelectorAll(".prog-filter-btn").forEach(function(b){b.classList.toggle("active",b.dataset.pf===progFilterVal);});'
  + 'document.getElementById("prog-modal-close").addEventListener("click",closeProgModal);'
  + 'document.getElementById("prog-cancel-btn").addEventListener("click",closeProgModal);'
  + 'document.getElementById("prog-save-btn").addEventListener("click",saveProg);'

  + 'function openProgModal(prog){'
  + '  editingProgRow=prog;'
  + '  document.getElementById("prog-modal-title").textContent=prog?"Edit Community":"Add Community";'
  + '  document.getElementById("pf-name").value=prog?prog["Community Name"]||"":"";'
  + '  document.getElementById("pf-area").value=prog?prog["Area"]||"":"";'
  + '  document.getElementById("pf-type").value=prog?prog["Program Type"]||"":"";'
  + '  document.getElementById("pf-ami").value=prog?prog["AMI Range"]||"":"";'
  + '  document.getElementById("pf-beds").value=prog?prog["Bedrooms"]||"":"";'
  + '  document.getElementById("pf-hh").value=prog?prog["Household Size Limit"]||"":"";'
  + '  document.getElementById("pf-ftb").value=prog?prog["First-Time Buyer"]||"":"";'
  + '  document.getElementById("pf-price").value=prog?prog["Price Range"]||"":"";'
  + '  document.getElementById("pf-status").value=prog?prog["Status"]||"Available":"Available";'
  + '  document.getElementById("pf-notes").value=prog?prog["Notes"]||"":"";'
  + '  document.getElementById("prog-modal").classList.add("open");'
  + '}'
  + 'function closeProgModal(){document.getElementById("prog-modal").classList.remove("open");editingProgRow=null;}'

  + 'function editProg(i){if(!progData||!progData.rows)return;openProgModal(progData.rows[i]);}'

  + 'function deleteProg(i){'
  + '  if(!progData||!progData.rows)return;'
  + '  var prog=progData.rows[i];'
  + '  if(!confirm("Delete \\""+( prog["Community Name"]||"this community")+"\\"? This cannot be undone."))return;'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){if(r&&r.ok){toast("Community deleted.");progData=null;loadPrograms();}else{toast((r&&r.error)||"Failed.",true);}})'
  + '    .withFailureHandler(function(e){toast("Error: "+(e.message||""),true);})'
  + '    .adminDeleteProgram(SESSION_TOKEN,prog._rowIndex);'
  + '}'

  + 'function saveProg(){'
  + '  var name=document.getElementById("pf-name").value.trim();'
  + '  var area=document.getElementById("pf-area").value.trim();'
  + '  if(!name||!area){toast("Community Name and Area are required.",true);return;}'
  + '  var prog={"Community Name":name,"Area":area,'
  + '    "Program Type":document.getElementById("pf-type").value.trim(),'
  + '    "AMI Range":document.getElementById("pf-ami").value.trim(),'
  + '    "Bedrooms":document.getElementById("pf-beds").value.trim(),'
  + '    "Household Size Limit":document.getElementById("pf-hh").value.trim(),'
  + '    "First-Time Buyer":document.getElementById("pf-ftb").value,'
  + '    "Price Range":document.getElementById("pf-price").value.trim(),'
  + '    "Status":document.getElementById("pf-status").value,'
  + '    "Notes":document.getElementById("pf-notes").value.trim(),'
  + '    "_rowIndex":editingProgRow?editingProgRow._rowIndex:-1'
  + '  };'
  + '  var btn=document.getElementById("prog-save-btn");'
  + '  btn.disabled=true;btn.innerHTML=\'<i class="fa-solid fa-circle-notch fa-spin"></i> Saving\u2026\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){'
  + '      btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-floppy-disk"></i> Save Community\';'
  + '      if(r&&r.ok){toast(editingProgRow?"Community updated.":"Community added.");closeProgModal();progData=null;loadPrograms();}else{toast((r&&r.error)||"Failed.",true);}'
  + '    })'
  + '    .withFailureHandler(function(e){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-floppy-disk"></i> Save Community\';toast("Error: "+(e.message||""),true);})'
  + '    .adminSaveProgram(SESSION_TOKEN,prog);'
  + '}'

  /* =====================================================
     PROPERTY SUBMISSIONS
     ===================================================== */
  + 'function loadProperties(){'
  + '  document.getElementById("ps-table-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div>\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(d){psData=d;renderPSTable(d);})'
  + '    .withFailureHandler(function(e){document.getElementById("ps-table-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>\'+esc(e.message||"Error")+\'</p></div>\';;})'
  + '    .adminGetPropertySubmissions(SESSION_TOKEN);'
  + '}'

  + 'document.getElementById("ps-status-filter").addEventListener("change",function(){if(psData)renderPSTable(psData);});'

  + 'function renderPSTable(d){'
  + '  if(!d||!d.ok||!d.rows||d.rows.length===0){document.getElementById("ps-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No property submissions yet.</p></div>\';return;}'
  + '  var statusF=(document.getElementById("ps-status-filter").value||"").toLowerCase();'
  + '  var rows=d.rows.filter(function(r){return!statusF||(r.status||"").toLowerCase()===statusF;});'
  + '  if(psSortCol>=0){'
  + '    var psKeys=["submitted_at","prop_address","contact_name","affordable_count","ami_percent","status"];'
  + '    var psk=psKeys[psSortCol];'
  + '    rows=rows.slice().sort(function(a,b){'
  + '      var av=String(a[psk]||"").toLowerCase(),bv=String(b[psk]||"").toLowerCase();'
  + '      return av<bv?-psSortDir:av>bv?psSortDir:0;'
  + '    });'
  + '  }'
  + '  if(!rows.length){document.getElementById("ps-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No results match your filter.</p></div>\';return;}'
  + '  var psCols=["Date","Address","Contact","Units","AMI","Status"];'
  + '  var thead=\'<thead><tr>\'+psCols.map(function(c,i){'
  + '    var icon=psSortCol===i?(psSortDir===1?\'\u25b4\':\'\u25be\'):\'\u25b4\u25be\';'
  + '    return\'<th class="th-sort" onclick="psSort(\'+i+\')">\'+c+\' <span class="sort-icon">\'+icon+\'</span></th>\';'
  + '  }).join("")+\'</tr></thead>\';'
  + '  var html=\'<table>\'+thead+\'<tbody>\';'
  + '  rows.forEach(function(r){'
  + '    var origIdx=d.rows.indexOf(r);'
  + '    html+=\'<tr onclick="openPSDrawer(\'+origIdx+\')">\''
  + '       +\'<td class="td-muted">\'+fmtDate(r.submitted_at)+\'</td>\''
  + '       +\'<td class="td-name">\'+esc(r.prop_address||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r.contact_name||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r.affordable_count||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r.ami_percent||"")+\'</td>\''
  + '       +\'<td>\'+pill(r.status||"new")+\'</td>\''
  + '       +\'</tr>\';'
  + '  });'
  + '  html+=\'</tbody></table>\';'
  + '  document.getElementById("ps-table-area").innerHTML=html;'
  + '}'
  + 'function psSort(col){if(psSortCol===col){psSortDir*=-1;}else{psSortCol=col;psSortDir=1;}if(psData)renderPSTable(psData);}'

  + 'function openPSDrawer(idx){'
  + '  if(!psData)return;'
  + '  var r=psData.rows[idx];'
  + '  document.getElementById("ps-drawer-title").textContent=r.prop_address||"Property Submission";'
  + '  var sections=['
  + '    {title:"Contact",fields:["contact_name","contact_org","contact_email","contact_phone"]},'
  + '    {title:"Property",fields:["prop_address","affordable_count","bedrooms","bathrooms","move_in_date","marketing_start","ami_percent","affordable_price"]},'
  + '    {title:"Financials",fields:["hoa_fee","hoa_covers","prop_tax_pct","special_assessments","deed_restriction_years"]},'
  + '    {title:"Solar",fields:["solar","solar_included","solar_lease_amount"]},'
  + '    {title:"Submission Info",fields:["submitted_at","status"]}'
  + '  ];'
  + '  var body="";'
  /* Status editor */
  + '  body+=\'<div><div class="field-group-title" style="border-radius:8px 8px 0 0;border:1px solid #f0f0eb;border-bottom:none;padding:.5rem .85rem;">Update Status</div>\''
  + '  +\'<div style="border:1px solid #f0f0eb;border-radius:0 0 8px 8px;padding:.85rem;">\''
  + '  +\'<div class="status-editor"><select id="ps-status-select"><option value="new">New</option><option value="reviewing">Reviewing</option><option value="approved">Approved</option><option value="declined">Declined</option></select>\''
  + '  +\'<button class="btn-primary btn-sm" onclick="savePSStatus(\'+idx+\')"><i class="fa-solid fa-check"></i> Save Status</button></div>\''
  + '  +\'</div></div>\';'
  + '  sections.forEach(function(sec){'
  + '    var rows2="";'
  + '    sec.fields.forEach(function(f){'
  + '      var v=r[f];if(!v&&v!==0)return;'
  + '      var label=f.replace(/_/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();});'
  + '      var val=f==="submitted_at"?fmtDate(v):esc(v);'
  + '      rows2+=\'<div class="field-row"><span class="field-label">\'+esc(label)+\'</span><span class="field-value">\'+val+\'</span></div>\';'
  + '    });'
  + '    if(rows2)body+=\'<div class="field-group"><div class="field-group-title">\'+esc(sec.title)+\'</div>\'+rows2+\'</div>\';'
  + '  });'
  /* File links */
  + '  if(r.file_links){'
  + '    var links=r.file_links.split("\\n").filter(Boolean);'
  + '    var lhtml=links.map(function(l){'
  + '      var parts=l.split(": https://");'
  + '      if(parts.length===2){return\'<a class="file-link" href="https://\'+esc(parts[1])+\'" target="_blank"><i class="fa-solid fa-file" style="margin-right:.4rem;"></i>\'+esc(parts[0])+\'</a>\';}'
  + '      return\'<p style="font-size:.82rem;color:#888;">\'+esc(l)+\'</p>\';'
  + '    }).join("");'
  + '    body+=\'<div class="field-group"><div class="field-group-title">Attached Files</div><div style="padding:.85rem;">\'+lhtml+\'</div></div>\';'
  + '  }'
  + '  document.getElementById("ps-drawer-body").innerHTML=body;'
  + '  document.getElementById("ps-status-select").value=r.status||"new";'
  + '  var drawer=document.getElementById("ps-drawer");'
  + '  drawer.setAttribute("aria-hidden","false");'
  + '  document.getElementById("ps-drawer-overlay").classList.add("active");'
  + '  drawer._rowIdx=idx;'
  + '}'

  + 'document.getElementById("ps-drawer-close").addEventListener("click",closePSDrawer);'
  + 'document.getElementById("ps-drawer-overlay").addEventListener("click",closePSDrawer);'
  + 'function closePSDrawer(){document.getElementById("ps-drawer").setAttribute("aria-hidden","true");document.getElementById("ps-drawer-overlay").classList.remove("active");}'

  + 'function savePSStatus(idx){'
  + '  var newStatus=document.getElementById("ps-status-select").value;'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){'
  + '      if(r&&r.ok){toast("Status updated.");psData.rows[idx].status=newStatus;renderPSTable(psData);}else{toast((r&&r.error)||"Failed.",true);}'
  + '    })'
  + '    .withFailureHandler(function(e){toast("Error: "+(e.message||""),true);})'
  + '    .adminUpdatePropertyStatus(SESSION_TOKEN,psData.rows[idx]._rowIndex,newStatus);'
  + '}'

  /* ESC closes drawers */
  + 'document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeILDrawer();closePSDrawer();closeLSTDrawer();}});'

  /* =====================================================
     LISTINGS
     ===================================================== */
  + 'var lstData=null,editingLstRow=null,lstFilterVal="active";'

  + 'function loadListings(){'
  + '  document.getElementById("lst-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading\u2026</p></div>\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(d){lstData=d;renderListings(d);})'
  + '    .withFailureHandler(function(e){document.getElementById("lst-area").innerHTML=\'<div class="loading-state"><i class="fa-solid fa-triangle-exclamation"></i><p>\'+esc(e.message||"Error")+\'</p></div>\';;})'
  + '    .adminGetListings(SESSION_TOKEN);'
  + '}'

  + 'function renderListings(d){'
  + '  if(!d||!d.ok){document.getElementById("lst-area").innerHTML=\'<div class="empty-state"><p>\'+esc(d&&d.error||"Error")+\'</p></div>\';return;}'
  + '  if(!d.rows||d.rows.length===0){document.getElementById("lst-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-house-chimney-window"></i><p>No listings yet. Click "Add Listing" to create one.</p></div>\';return;}'
  + '  var visible=d.rows.filter(function(r,i){r._displayIdx=i;'
  + '    var a=(r.active||"").toString().trim().toUpperCase()==="YES";'
  + '    if(lstFilterVal==="active")return a;'
  + '    if(lstFilterVal==="inactive")return !a;'
  + '    return true;'
  + '  });'
  + '  document.querySelectorAll(".prog-filter-btn[data-lf]").forEach(function(b){b.classList.toggle("active",b.dataset.lf===lstFilterVal);});'
  + '  if(!visible.length){document.getElementById("lst-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-filter"></i><p>No listings match this filter.</p></div>\';return;}'
  + '  var html=\'<div class="prog-grid">\';'
  + '  visible.forEach(function(r){'
  + '    var i=r._displayIdx;'
  + '    var isActive=(r.active||"").toString().trim().toUpperCase()==="YES";'
  + '    var bgCls=isActive?"lst-card--active":"lst-card--inactive";'
  + '    var badgeCls=isActive?"pill-active":"pill-expired";'
  + '    var badgeLabel=isActive?"Active":"Inactive";'
  + '    var addr=(r.address||"")+(r.city?", "+r.city:"");'
  + '    html+=\'<div class="lst-card \'+bgCls+\'" onclick="openLSTDrawer(\'+i+\')">\''
  + '       +\'<div class="lst-card-top"><div style="min-width:0;flex:1;"><div class="lst-card-name" title="\'+esc(r.listing_id||"")+\'">\'+esc(r.listing_id||"Unnamed")+\'</div>\''
  + '         +\'<div class="lst-card-addr"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.72rem;margin-right:.25rem;"></i>\'+esc(addr||"No address")+\'</div></div>\''
  + '         +\'<span class="status-pill \'+badgeCls+\'" style="flex-shrink:0;">\'+badgeLabel+\'</span></div>\''
  + '       +\'<div class="lst-card-meta">\''
  + '         +(r.price?\'<span class="lst-meta-item"><i class="fa-solid fa-tag" style="color:#888;"></i>\'+esc(r.price)+\'</span>\':"")'
  + '         +(r.bedrooms?\'<span class="lst-meta-item"><i class="fa-solid fa-bed" style="color:#888;"></i>\'+esc(r.bedrooms)+\' br</span>\':"")'
  + '         +(r.bathrooms?\'<span class="lst-meta-item"><i class="fa-solid fa-bath" style="color:#888;"></i>\'+esc(r.bathrooms)+\' ba</span>\':"")'
  + '         +(r.ami_percent?\'<span class="lst-meta-item"><i class="fa-solid fa-chart-bar" style="color:#888;"></i>\'+esc(r.ami_percent)+\' AMI</span>\':"")'
  + '         +(r.min_credit_score?\'<span class="lst-meta-item"><i class="fa-solid fa-credit-card" style="color:#888;"></i>Credit \'+esc(r.min_credit_score)+\'+</span>\':"")'
  + '       +\'</div>\''
  + '       +\'<div class="lst-card-footer">\''
  + '         +\'<button class="btn-secondary btn-sm" onclick="event.stopPropagation();editLst(\'+i+\')"><i class="fa-solid fa-pen"></i> Edit</button>\''
  + '         +\'<button class="btn-danger btn-sm" onclick="event.stopPropagation();deleteLst(\'+i+\')"><i class="fa-solid fa-trash"></i> Delete</button>\''
  + '       +\'</div>\''
  + '       +\'</div>\';'
  + '  });'
  + '  html+=\'</div>\';'
  + '  document.getElementById("lst-area").innerHTML=html;'
  + '}'

  /* Filter bar */
  + 'document.getElementById("lst-filter-bar").addEventListener("click",function(e){'
  + '  var btn=e.target.closest(".prog-filter-btn[data-lf]");'
  + '  if(!btn)return;'
  + '  lstFilterVal=btn.dataset.lf||"active";'
  + '  if(lstData)renderListings(lstData);'
  + '});'
  + 'document.querySelectorAll(".prog-filter-btn[data-lf]").forEach(function(b){b.classList.toggle("active",b.dataset.lf===lstFilterVal);});'

  /* Drawer open */
  + 'function openLSTDrawer(idx){'
  + '  if(!lstData)return;'
  + '  var r=lstData.rows[idx];'
  + '  document.getElementById("lst-drawer-title").textContent=(r.listing_id||r.listing_name||"Listing");'
  + '  var sections=['
  + '    {title:"Property Info",fields:["listing_id","listing_name","active","address","city","price","bedrooms","bathrooms","sqft","listing_type","program_type"]},'
  + '    {title:"Income & AMI",fields:["ami_percent","max_income_1person","max_income_2person","max_income_3person","max_income_4person","max_income_5person","max_income_6person","min_income"]},'
  + '    {title:"Household & Residency",fields:["min_household_size","max_household_size","household_together_months","first_time_buyer_required","no_ownership_years","sd_county_residency_required","sd_residency_months","sdhc_prior_purchase_allowed"]},'
  + '    {title:"Credit & Debt",fields:["min_credit_score","max_dti_percent","max_monthly_debt"]},'
  + '    {title:"Assets & Financing",fields:["min_assets","max_assets","min_down_payment_pct","max_down_payment_pct","min_employment_months"]},'
  + '    {title:"Disclosures",fields:["foreclosure_allowed","foreclosure_min_years","bankruptcy_allowed","bankruptcy_min_years","judgments_allowed","citizenship_required","permanent_resident_acceptable"]},'
  + '    {title:"Notes",fields:["program_notes","internal_notes"]}'
  + '  ];'
  + '  var body=\'<div><div class="field-group-title" style="border-radius:8px 8px 0 0;border:1px solid #f0f0eb;border-bottom:none;padding:.5rem .85rem;">Active for Matching</div>\''
  + '    +\'<div style="border:1px solid #f0f0eb;border-radius:0 0 8px 8px;padding:.85rem;">\''
  + '    +\'<div class="status-editor"><select id="lst-active-select"><option value="YES">YES — include in daily matching</option><option value="NO">NO — exclude from matching</option></select>\''
  + '    +\'<button class="btn-primary btn-sm" onclick="saveLSTActive(\'+idx+\')"><i class="fa-solid fa-check"></i> Save</button></div>\''
  + '    +\'<textarea class="notes-area" id="lst-note-input" placeholder="Add or edit internal notes\u2026" style="margin-top:.65rem;"></textarea>\''
  + '    +\'</div></div>\';'
  + '  sections.forEach(function(sec){'
  + '    var rows2="";'
  + '    sec.fields.forEach(function(f){'
  + '      var v=r[f];if(!v&&v!==0)return;'
  + '      var label=f.replace(/_/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();});'
  + '      var val=f==="internal_notes"?\'<span style="white-space:pre-wrap">\'+esc(v)+\'</span>\':esc(v);'
  + '      rows2+=\'<div class="field-row"><span class="field-label">\'+esc(label)+\'</span><span class="field-value">\'+val+\'</span></div>\';'
  + '    });'
  + '    if(rows2)body+=\'<div class="field-group"><div class="field-group-title">\'+esc(sec.title)+\'</div>\'+rows2+\'</div>\';'
  + '  });'
  + '  document.getElementById("lst-drawer-body").innerHTML=body;'
  + '  document.getElementById("lst-active-select").value=(r.active||"NO").toString().trim().toUpperCase()==="YES"?"YES":"NO";'
  + '  document.getElementById("lst-note-input").value=r.internal_notes||"";'
  + '  var drawer=document.getElementById("lst-drawer");'
  + '  drawer.setAttribute("aria-hidden","false");'
  + '  document.getElementById("lst-drawer-overlay").classList.add("active");'
  + '  drawer._rowIdx=idx;'
  + '}'

  + 'document.getElementById("lst-drawer-close").addEventListener("click",closeLSTDrawer);'
  + 'document.getElementById("lst-drawer-overlay").addEventListener("click",closeLSTDrawer);'
  + 'function closeLSTDrawer(){document.getElementById("lst-drawer").setAttribute("aria-hidden","true");document.getElementById("lst-drawer-overlay").classList.remove("active");}'

  /* Save active toggle + internal notes from drawer */
  + 'function saveLSTActive(idx){'
  + '  var newActive=document.getElementById("lst-active-select").value;'
  + '  var note=document.getElementById("lst-note-input").value;'
  + '  var listing=Object.assign({},lstData.rows[idx]);'
  + '  listing.active=newActive;'
  + '  listing.internal_notes=note;'
  + '  var btn=document.querySelector(\'[onclick="saveLSTActive(\'+idx+\')"]\');'
  + '  if(btn){btn.disabled=true;btn.innerHTML=\'<i class="fa-solid fa-circle-notch fa-spin"></i>\';}'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){'
  + '      if(btn){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-check"></i> Save\';}'
  + '      if(r&&r.ok){'
  + '        toast("Listing updated.");'
  + '        lstData.rows[idx].active=newActive;'
  + '        lstData.rows[idx].internal_notes=note;'
  + '        renderListings(lstData);'
  + '        openLSTDrawer(idx);'
  + '      } else { toast((r&&r.error)||"Failed to save.",true); }'
  + '    })'
  + '    .withFailureHandler(function(e){if(btn){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-check"></i> Save\';}toast("Error: "+(e.message||""),true);})'
  + '    .adminSaveListing(SESSION_TOKEN,listing);'
  + '}'

  /* Add/Edit modal */
  + 'document.getElementById("lst-add-btn").addEventListener("click",function(){openLSTModal(null);});'
  + 'document.getElementById("lst-modal-close").addEventListener("click",closeLSTModal);'
  + 'document.getElementById("lst-cancel-btn").addEventListener("click",closeLSTModal);'
  + 'document.getElementById("lst-save-btn").addEventListener("click",saveListing);'

  + 'function openLSTModal(r){'
  + '  editingLstRow=r;'
  + '  document.getElementById("lst-modal-title").textContent=r?"Edit Listing":"Add Listing";'
  + '  document.getElementById("lf-id").value=r?r.listing_id||"":"";'
  + '  document.getElementById("lf-name").value=r?r.listing_name||"":"";'
  + '  document.getElementById("lf-active").value=r?(r.active||"NO").toString().trim().toUpperCase()==="YES"?"YES":"NO":"YES";'
  + '  document.getElementById("lf-type").value=r?r.listing_type||"affordable":"affordable";'
  + '  document.getElementById("lf-address").value=r?r.address||"":"";'
  + '  document.getElementById("lf-city").value=r?r.city||"":"";'
  + '  document.getElementById("lf-price").value=r?r.price||"":"";'
  + '  document.getElementById("lf-program-type").value=r?r.program_type||"":"";'
  + '  document.getElementById("lf-beds").value=r?r.bedrooms||"":"";'
  + '  document.getElementById("lf-baths").value=r?r.bathrooms||"":"";'
  + '  document.getElementById("lf-sqft").value=r?r.sqft||"":"";'
  + '  document.getElementById("lf-ami").value=r?r.ami_percent||"":"";'
  + '  document.getElementById("lf-credit").value=r?r.min_credit_score||"":"";'
  + '  document.getElementById("lf-dti").value=r?r.max_dti_percent||"":"";'
  + '  document.getElementById("lf-debt").value=r?r.max_monthly_debt||"":"";'
  + '  document.getElementById("lf-minhh").value=r?r.min_household_size||"":"";'
  + '  document.getElementById("lf-maxhh").value=r?r.max_household_size||"":"";'
  + '  document.getElementById("lf-ftb").value=r?r.first_time_buyer_required||"":"";'
  + '  document.getElementById("lf-sdres").value=r?r.sd_county_residency_required||"":"";'
  + '  document.getElementById("lf-inc1").value=r?r.max_income_1person||"":"";'
  + '  document.getElementById("lf-inc4").value=r?r.max_income_4person||"":"";'
  + '  document.getElementById("lf-inc6").value=r?r.max_income_6person||"":"";'
  + '  document.getElementById("lf-prog-notes").value=r?r.program_notes||"":"";'
  + '  document.getElementById("lf-int-notes").value=r?r.internal_notes||"":"";'
  + '  document.getElementById("lst-modal").classList.add("open");'
  + '}'
  + 'function closeLSTModal(){document.getElementById("lst-modal").classList.remove("open");editingLstRow=null;}'

  + 'function editLst(i){if(!lstData||!lstData.rows)return;openLSTModal(lstData.rows[i]);}'

  + 'function deleteLst(i){'
  + '  if(!lstData||!lstData.rows)return;'
  + '  var r=lstData.rows[i];'
  + '  if(!confirm("Delete listing \\""+( r.listing_id||"this listing")+"\\"? This will also remove it from matching. Cannot be undone."))return;'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){if(r&&r.ok){toast("Listing deleted.");lstData=null;loadListings();}else{toast((r&&r.error)||"Failed.",true);}})'
  + '    .withFailureHandler(function(e){toast("Error: "+(e.message||""),true);})'
  + '    .adminDeleteListing(SESSION_TOKEN,lstData.rows[i]._rowIndex);'
  + '}'

  + 'function saveListing(){'
  + '  var id=document.getElementById("lf-id").value.trim();'
  + '  if(!id){toast("Property ID / Name is required.",true);return;}'
  + '  var listing={'
  + '    listing_id:id,'
  + '    listing_name:document.getElementById("lf-name").value.trim()||id,'
  + '    active:document.getElementById("lf-active").value,'
  + '    ami_percent:document.getElementById("lf-ami").value.trim(),'
  + '    min_credit_score:document.getElementById("lf-credit").value.trim(),'
  + '    max_dti_percent:document.getElementById("lf-dti").value.trim(),'
  + '    max_monthly_debt:document.getElementById("lf-debt").value.trim(),'
  + '    min_household_size:document.getElementById("lf-minhh").value.trim(),'
  + '    max_household_size:document.getElementById("lf-maxhh").value.trim(),'
  + '    first_time_buyer_required:document.getElementById("lf-ftb").value,'
  + '    sd_county_residency_required:document.getElementById("lf-sdres").value,'
  + '    max_income_1person:document.getElementById("lf-inc1").value.trim(),'
  + '    max_income_2person:"",max_income_3person:"",'
  + '    max_income_4person:document.getElementById("lf-inc4").value.trim(),'
  + '    max_income_5person:"",max_income_6person:document.getElementById("lf-inc6").value.trim(),'
  + '    program_notes:document.getElementById("lf-prog-notes").value.trim(),'
  + '    address:document.getElementById("lf-address").value.trim(),'
  + '    city:document.getElementById("lf-city").value.trim(),'
  + '    price:document.getElementById("lf-price").value.trim(),'
  + '    bedrooms:document.getElementById("lf-beds").value.trim(),'
  + '    bathrooms:document.getElementById("lf-baths").value.trim(),'
  + '    sqft:document.getElementById("lf-sqft").value.trim(),'
  + '    listing_type:document.getElementById("lf-type").value,'
  + '    program_type:document.getElementById("lf-program-type").value.trim(),'
  + '    internal_notes:document.getElementById("lf-int-notes").value.trim(),'
  + '    _rowIndex:editingLstRow?editingLstRow._rowIndex:-1'
  + '  };'
  + '  var btn=document.getElementById("lst-save-btn");'
  + '  btn.disabled=true;btn.innerHTML=\'<i class="fa-solid fa-circle-notch fa-spin"></i> Saving\u2026\';'
  + '  google.script.run'
  + '    .withSuccessHandler(function(r){'
  + '      btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-floppy-disk"></i> Save Listing\';'
  + '      if(r&&r.ok){toast(editingLstRow?"Listing updated.":"Listing added.");closeLSTModal();lstData=null;loadListings();}else{toast((r&&r.error)||"Failed.",true);}'
  + '    })'
  + '    .withFailureHandler(function(e){btn.disabled=false;btn.innerHTML=\'<i class="fa-solid fa-floppy-disk"></i> Save Listing\';toast("Error: "+(e.message||""),true);})'
  + '    .adminSaveListing(SESSION_TOKEN,listing);'
  + '}'
  ;
}
