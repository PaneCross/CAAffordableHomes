/* ==========================================================
   CA Affordable Homes — Listing Notification Apps Script
   ==========================================================

   SETUP INSTRUCTIONS (do this once):

   1. Open your Google Sheet
   2. Click Extensions → Apps Script
   3. Delete the default empty function
   4. Paste this entire file and click Save (disk icon)

   5. UPDATE THE SUBSCRIBERS TAB HEADERS:
      - Set the header row to these exact column names:
        A: Email | B: First Name | C: Last Name | D: Phone | E: Regions | F: Date Subscribed
      - Clear any test rows added before this update (column layout changed)

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
