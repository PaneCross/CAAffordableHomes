/* ==========================================================
   CA Affordable Homes — Listing Notification Apps Script
   ==========================================================

   SETUP INSTRUCTIONS (do this once):

   1. Open your Google Sheet
   2. Click Extensions → Apps Script
   3. Delete the default empty function
   4. Paste this entire file and click Save (disk icon)

   5. DEPLOY AS WEB APP:
      - Click Deploy → New deployment
      - Click the gear icon → Web App
      - Description: "CA Affordable Homes Notifier"
      - Execute as: Me
      - Who has access: Anyone
      - Click Deploy → Authorize (sign in with your Google account)
      - COPY the Web App URL shown — you will need it next

   6. PASTE THE WEB APP URL into homes.html:
      - Open homes.html in a text editor
      - Find:  var SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
      - Replace the placeholder with the URL you copied

   7. SET UP THE EDIT TRIGGER:
      - In the Apps Script editor, click the clock icon (Triggers) on the left
      - Click "+ Add Trigger" (bottom right)
      - Choose function: onListingChange
      - Event source: From spreadsheet
      - Event type: On edit
      - Click Save

   That's it! Subscriber sign-ups will now appear in the
   "Subscribers" tab automatically, and notification emails
   will fire whenever you add or edit a listing's City field.

   ========================================================== */

/* ── Configuration ── */
var SPREADSHEET_ID  = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw';
var LISTINGS_SHEET  = 'Listings';
var SUBS_SHEET      = 'Subscribers';
var SITE_URL        = 'https://caaffordablehomes.com/homes.html'; /* update when domain is live */
var FROM_NAME       = 'CA Affordable Homes Team';
var REPLY_TO        = 'Info@CAAffordableHomes.com';

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
   doGet — Subscriber sign-up endpoint
   Called when the notification form is submitted on the site.
   Receives: name, email, phone, regions (comma-separated keys)
   ========================================================== */
function doGet(e) {
  try {
    var email   = (e.parameter.email   || '').trim().toLowerCase();
    var name    = (e.parameter.name    || '').trim();
    var phone   = (e.parameter.phone   || '').trim();
    var regions = (e.parameter.regions || '').trim();

    if (!email || !regions) {
      return jsonResponse({ ok: false, error: 'Missing email or regions' });
    }

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SUBS_SHEET);

    /* Check for existing subscriber with same email — update if found */
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0].toString().toLowerCase() === email) {
          /* Update regions and timestamp for existing subscriber */
          sheet.getRange(i + 2, 2).setValue(regions);
          sheet.getRange(i + 2, 3).setValue(new Date());
          return jsonResponse({ ok: true, updated: true });
        }
      }
    }

    /* New subscriber — append a row */
    sheet.appendRow([email, regions, new Date()]);
    return jsonResponse({ ok: true });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
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
    /* City not mapped to any region — log and skip */
    Logger.log('City not matched to any region: ' + city);
    return;
  }

  /* Read all subscribers */
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SUBS_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; /* no subscribers yet */

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (var i = 0; i < data.length; i++) {
    var subEmail   = (data[i][0] || '').toString().trim();
    var subRegions = (data[i][1] || '').toString().trim().split(',')
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

      sendNotificationEmail(subEmail, city, status, propName, regionLabels);
    }
  }
}

/* ==========================================================
   sendNotificationEmail
   Sends a branded HTML + plain-text notification email.
   ========================================================== */
function sendNotificationEmail(toEmail, city, status, propName, regionLabel) {
  var statusLower = status.toLowerCase();
  var statusPhrase = (statusLower === 'coming soon') ? 'is coming soon' : 'is now available';
  var subject = '\uD83C\uDFE1 New Listing Alert: ' + propName + ' in ' + city;

  /* Plain text fallback */
  var body =
    'Hi there,\n\n'
    + 'Great news \u2014 a new listing in ' + city + ' that matches your interest in '
    + regionLabel + ' ' + statusPhrase + ':\n\n'
    + '\u2022 Property: ' + propName + '\n'
    + '\u2022 Location: ' + city + '\n'
    + '\u2022 Status:   ' + status + '\n\n'
    + 'Click below to view all current listings and start your free pre-screening:\n'
    + SITE_URL + '\n\n'
    + 'Pre-screening is always free \u2014 no credit check, no obligation.\n\n'
    + 'To unsubscribe from listing alerts, reply with "Unsubscribe" in the subject line.\n\n'
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
    +   '<p style="color:#555;margin-top:0;">A new listing in <strong>' + city + '</strong> '
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
    +   '<p style="color:#999;font-size:12px;margin:0;">'
    +     'You received this because you signed up for listing alerts at CAAffordableHomes.com.<br>'
    +     'To unsubscribe, reply with &ldquo;Unsubscribe&rdquo; in the subject line.<br>'
    +     'We are not a lender. Pre-screening is informational only.'
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
    'El Cajon',
    'Available',
    'Sunset Ridge Townhomes',
    'East County'
  );
  Logger.log('Test email sent to your account.');
}
