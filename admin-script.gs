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
      - Execute as: Me
      - Who has access: Anyone with Google account
      - Click Deploy → Authorize → Copy the new Web App URL

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
var ADMIN_PROG_SHEET   = 'Programs';
var ADMIN_DASH_SHEET   = 'Dashboard';

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

  /* --- Show login page --- */
  return HtmlService
    .createHtmlOutput(buildLoginHTML())
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
function buildLoginHTML() {
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
    + '.btn-google{display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.7rem;background:#fff;border:1.5px solid #ddd;border-radius:7px;font-size:.9rem;font-weight:500;cursor:pointer;color:#333;transition:background .15s;font-family:inherit;}'
    + '.btn-google:hover{background:#fafafa;}'
    + '.btn-google img{width:18px;height:18px;}'
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

    /* Google sign-in option */
    + '  <button class="btn-google" onclick="googleSignIn()">'
    + '    <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>'
    + '    Sign in with Google'
    + '  </button>'
    + '  <p class="google-note">Sign in with the Google account associated with this admin panel.<br>tj@nostos.tech or the authorized team email.</p>'

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
    + 'function googleSignIn(){'
    + '  google.script.run.withSuccessHandler(function(){'
    + '    window.location.reload();'
    + '  }).adminRequestOTP("dummy_to_force_reload");'
    + '  /* Google auth is automatic — reloading re-triggers doGet which checks Session.getActiveUser() */'
    + '  window.location.reload();'
    + '}'
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
    + '    <div class="toolbar">'
    + '      <button class="btn-primary" id="prog-add-btn"><i class="fa-solid fa-plus"></i> Add Community</button>'
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

    + '</div></div>' /* /main-wrap /app */

    /* Toast notification */
    + '<div id="toast" class="toast" role="alert"></div>'

    + '<script>'
    + 'var SESSION_TOKEN=' + tokenJS + ';'
    + 'var USER_EMAIL=' + emailJS + ';'
    + 'var ilData=null, psData=null, progData=null;'
    + 'var editingProgRow=null;'
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
    + '.sb-nav{flex:1;padding:.75rem .5rem;display:flex;flex-direction:column;gap:.2rem;}'
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
    + '.prog-card-name{font-weight:600;font-size:.95rem;}'
    + '.prog-card-area{font-size:.8rem;color:#888;margin-top:.1rem;}'
    + '.prog-card-body{display:flex;flex-direction:column;gap:.35rem;font-size:.82rem;}'
    + '.prog-detail{display:flex;justify-content:space-between;}'
    + '.prog-detail-label{color:#888;}'
    + '.prog-detail-value{font-weight:500;color:#333;}'
    + '.prog-card-footer{display:flex;gap:.5rem;padding-top:.5rem;border-top:1px solid #f0f0eb;}'
    /* Drawer */
    + '.drawer{position:fixed;right:0;top:0;height:100%;width:480px;max-width:95vw;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .25s;z-index:200;display:flex;flex-direction:column;}'
    + '.drawer[aria-hidden="false"]{transform:translateX(0);}'
    + '.drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:199;display:none;}'
    + '.drawer-overlay.active{display:block;}'
    + '.drawer-inner{display:flex;flex-direction:column;height:100%;overflow:hidden;}'
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
  + '  document.getElementById("dash-stats").innerHTML='
  + '    \'<div class="stat-card"><div class="stat-label">Total Applicants</div><div class="stat-value">\'+il.total+\'</div><div class="stat-sub">All time</div></div>\''
  + '   +\'<div class="stat-card highlight"><div class="stat-label">Needs Review</div><div class="stat-value">\'+il.new+\'</div><div class="stat-sub">Status: new</div></div>\''
  + '   +\'<div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">\'+il.active+\'</div><div class="stat-sub">On interest list</div></div>\''
  + '   +\'<div class="stat-card"><div class="stat-label">Matched</div><div class="stat-value">\'+il.matched+\'</div><div class="stat-sub">Placed in homes</div></div>\''
  + '   +\'<div class="stat-card"><div class="stat-label">New (7 days)</div><div class="stat-value">\'+d.il.recent7Days+\'</div><div class="stat-sub">Recent submissions</div></div>\''
  + '   +\'<div class="stat-card \'+( ps.new>0?"highlight":"")+\'"><div class="stat-label">Property Queue</div><div class="stat-value">\'+ps.new+\'</div><div class="stat-sub">New submissions</div></div>\''
  + '   +\'<div class="stat-card"><div class="stat-label">Programs</div><div class="stat-value">\'+d.programs+\'</div><div class="stat-sub">Active communities</div></div>\';'
  + '  var ilDetail=["new","reviewing","active","matched","expired"].map(function(s){return\'<div class="status-row"><span>\'+s.charAt(0).toUpperCase()+s.slice(1)+\'</span>\'+pill(s)+\'<strong>\'+il[s]+\'</strong></div>\';}).join("");'
  + '  document.getElementById("dash-il-detail").innerHTML=ilDetail;'
  + '  var psDetail=["new","reviewing","approved","declined"].map(function(s){return\'<div class="status-row"><span>\'+s.charAt(0).toUpperCase()+s.slice(1)+\'</span>\'+pill(s)+\'<strong>\'+ps[s]+\'</strong></div>\';}).join("");'
  + '  document.getElementById("dash-ps-detail").innerHTML=psDetail;'
  + '  document.getElementById("dash-bottom").style.display="grid";'
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
  + '  var ni=h.indexOf("full_name"),ei=h.indexOf("email"),pi=h.indexOf("phone"),'
  + '      si=h.indexOf("status"),di=h.indexOf("submitted_at"),ai=h.indexOf("area_preference"),'
  + '      hhi=h.indexOf("household_size"),ci=h.indexOf("credit_score_self");'
  + '  var search=(document.getElementById("il-search").value||"").toLowerCase();'
  + '  var statusF=(document.getElementById("il-status-filter").value||"").toLowerCase();'
  + '  var rows=d.rows.filter(function(r){'
  + '    var match=!search||(r[ni]||"").toLowerCase().indexOf(search)>-1||(r[ei]||"").toLowerCase().indexOf(search)>-1;'
  + '    var st=!statusF||(r[si]||"").toLowerCase()===statusF;'
  + '    return match&&st;'
  + '  });'
  + '  if(!rows.length){document.getElementById("il-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No results match your filter.</p></div>\';return;}'
  + '  var html=\'<table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Submitted</th><th>Household</th><th>Credit</th><th>Area</th></tr></thead><tbody>\';'
  + '  rows.forEach(function(r,idx){'
  + '    var origIdx=d.rows.indexOf(r);'
  + '    html+=\'<tr onclick="openILDrawer(\'+origIdx+\')">\''
  + '       +\'<td class="td-name">\'+esc(r[ni]||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[ei]||"")+\'</td>\''
  + '       +\'<td>\'+pill(r[si]||"new")+\'</td>\''
  + '       +\'<td class="td-muted">\'+fmtDate(r[di])+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[hhi]||"")+\'</td>\''
  + '       +\'<td class="td-muted">\'+esc(r[ci]||"")+\'</td>\''
  + '       +\'<td class="td-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\'+esc(r[ai]||"")+\'</td>\''
  + '       +\'</tr>\';'
  + '  });'
  + '  html+=\'</tbody></table>\';'
  + '  document.getElementById("il-table-area").innerHTML=html;'
  + '}'

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
  + '    {title:"Status & Notes",fields:["status","submitted_at","updated_at","renewal_reminder_sent","additional_info"]}'
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
  + '      var val=f.indexOf("_at")>-1?fmtDate(v):esc(v);'
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
  + '        renderILTable(ilData);'
  + '        document.getElementById("il-note-input").value="";'
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
  + '  var COLS=["Community Name","Area","Program Type","AMI Range","Bedrooms","Household Size Limit","First-Time Buyer","Price Range","Status","Notes"];'
  + '  var html=\'<div class="prog-grid">\';'
  + '  d.rows.forEach(function(prog,i){'
  + '    var status=(prog["Status"]||"").toLowerCase();'
  + '    var badgeCls=status==="available"?"pill-active":status==="coming soon"?"pill-reviewing":"pill-expired";'
  + '    html+=\'<div class="prog-card">\''
  + '       +\'<div class="prog-card-header"><div><div class="prog-card-name">\'+esc(prog["Community Name"]||"Unnamed")+\'</div><div class="prog-card-area"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.75rem;margin-right:.3rem;"></i>\'+esc(prog["Area"]||"")+\'</div></div><span class="status-pill \'+badgeCls+\'">\'+esc(prog["Status"]||"")+\'</span></div>\''
  + '       +\'<div class="prog-card-body">\';'
  + '    [["Program Type","fa-building"],["AMI Range","fa-chart-bar"],["Bedrooms","fa-bed"],["First-Time Buyer","fa-house"],["Price Range","fa-tag"]].forEach(function(f){'
  + '      if(prog[f[0]])html+=\'<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid \'+f[1]+\'" style="width:14px;color:#888;margin-right:.3rem;"></i>\'+esc(f[0])+\'</span><span class="prog-detail-value">\'+esc(prog[f[0]])+\'</span></div>\';'
  + '    });'
  + '    if(prog["Notes"])html+=\'<div style="font-size:.78rem;color:#888;background:#f7f7f4;border-radius:6px;padding:.45rem .6rem;margin-top:.2rem;">\'+esc(prog["Notes"])+\'</div>\';'
  + '    html+=\'</div><div class="prog-card-footer"><button class="btn-secondary btn-sm" onclick="editProg(\'+i+\')"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn-danger btn-sm" onclick="deleteProg(\'+i+\')"><i class="fa-solid fa-trash"></i> Delete</button></div>\''
  + '       +\'</div>\';'
  + '  });'
  + '  html+=\'</div>\';'
  + '  document.getElementById("prog-area").innerHTML=html;'
  + '}'

  /* Add / edit program modal */
  + 'document.getElementById("prog-add-btn").addEventListener("click",function(){openProgModal(null);});'
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
  + '  if(!rows.length){document.getElementById("ps-table-area").innerHTML=\'<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No results match your filter.</p></div>\';return;}'
  + '  var html=\'<table><thead><tr><th>Date</th><th>Address</th><th>Contact</th><th>Units</th><th>AMI</th><th>Status</th></tr></thead><tbody>\';'
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
  + 'document.addEventListener("keydown",function(e){if(e.key==="Escape"){closeILDrawer();closePSDrawer();}});';
}
