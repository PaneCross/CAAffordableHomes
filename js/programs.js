/* =========================================================
   CA Affordable Homes — programs.js
   Fetches available program criteria from a published Google
   Sheet tab and renders them as program cards on programs.html.

   HOW TO UPDATE:
   1. Go to your Google Sheet
   2. Open the "Programs" tab
   3. Add or edit community rows — the page updates automatically
      within a few minutes (Google caches published CSVs briefly)

   HOW TO SET UP THE SHEET URL (one-time):
   1. Open the Programs tab in Google Sheets
   2. File → Share → Publish to web
   3. Under "Link", choose the "Programs" sheet and "CSV" format
   4. Click Publish and copy the URL
   5. Paste it as the value of PROGRAMS_CSV_URL below

   SHEET COLUMN HEADERS (must match exactly, row 1):
     Community Name | Area | Program Type | AMI Range |
     Bedrooms | Household Size Limit | First-Time Buyer |
     Price Range | Status | Notes

   STATUS values: "Available" or "Coming Soon"
   Rows with status "Inactive" or blank will be hidden.
   ========================================================= */

var PROGRAMS_CSV_URL = 'PASTE_YOUR_PROGRAMS_TAB_CSV_URL_HERE';

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
var programsGrid = document.getElementById('programs-grid');

if (programsGrid) {
  if (PROGRAMS_CSV_URL === 'PASTE_YOUR_PROGRAMS_TAB_CSV_URL_HERE') {
    showProgramsPlaceholder();
  } else {
    loadPrograms();
  }
}

/* ---------------------------------------------------------
   Fetch + render
   --------------------------------------------------------- */
function loadPrograms() {
  showProgramsLoading();

  fetch(PROGRAMS_CSV_URL)
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(csv) {
      var rows = parseCSVToObjects(csv);
      var visible = rows.filter(function(row) {
        var s = (row['Status'] || '').trim().toLowerCase();
        return s === 'available' || s === 'coming soon';
      });
      if (visible.length === 0) {
        showProgramsEmpty();
      } else {
        renderPrograms(visible);
      }
    })
    .catch(function(err) {
      console.error('[CA Affordable Homes] programs.js failed to load:', err);
      showProgramsError();
    });
}

/* ---------------------------------------------------------
   Render
   --------------------------------------------------------- */
function renderPrograms(rows) {
  programsGrid.innerHTML = '';
  rows.forEach(function(row) {
    programsGrid.appendChild(buildProgramCard(row));
  });
}

function buildProgramCard(row) {
  var name        = (row['Community Name']       || '').trim();
  var area        = (row['Area']                 || '').trim();
  var programType = (row['Program Type']         || '').trim();
  var amiRange    = (row['AMI Range']            || '').trim();
  var bedrooms    = (row['Bedrooms']             || '').trim();
  var householdSz = (row['Household Size Limit'] || '').trim();
  var ftb         = (row['First-Time Buyer']     || '').trim();
  var priceRange  = (row['Price Range']          || '').trim();
  var status      = (row['Status']               || 'Available').trim();
  var notes       = (row['Notes']                || '').trim();

  var statusLower = status.toLowerCase();
  var badgeClass  = statusLower === 'available' ? 'pc-badge--available' : 'pc-badge--soon';

  /* Tags */
  var tagsHTML = '';
  if (amiRange)    tagsHTML += '<span class="tag">' + escHTML(amiRange)    + '</span>';
  if (programType) tagsHTML += '<span class="tag">' + escHTML(programType) + '</span>';

  /* Detail rows */
  var detailsHTML = '';
  if (bedrooms)    detailsHTML += detailRow('fa-bed',        'Bedrooms',             bedrooms);
  if (householdSz) detailsHTML += detailRow('fa-users',      'Household Size Limit', householdSz);
  if (ftb)         detailsHTML += detailRow('fa-house',      'First-Time Buyer',     ftb);
  if (priceRange)  detailsHTML += detailRow('fa-tag',        'Price Range',          priceRange);

  var card = document.createElement('article');
  card.className = 'program-card';

  card.innerHTML =
    '<div class="pc-header">' +
      '<div class="pc-title-block">' +
        '<h3 class="pc-name">' + escHTML(name || 'Community Program') + '</h3>' +
        (area ? '<p class="pc-area"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHTML(area) + '</p>' : '') +
      '</div>' +
      '<span class="pc-badge ' + badgeClass + '">' + escHTML(status) + '</span>' +
    '</div>' +
    (tagsHTML ? '<div class="pc-tags">' + tagsHTML + '</div>' : '') +
    (detailsHTML ? '<ul class="pc-details" role="list">' + detailsHTML + '</ul>' : '') +
    (notes
      ? '<div class="pc-notes"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' + escHTML(notes) + '</div>'
      : '');

  return card;
}

function detailRow(icon, label, value) {
  return (
    '<li class="pc-detail-row">' +
      '<span class="pc-detail-label">' +
        '<i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + label +
      '</span>' +
      '<span class="pc-detail-value">' + escHTML(value) + '</span>' +
    '</li>'
  );
}

/* ---------------------------------------------------------
   State messages
   --------------------------------------------------------- */
function showProgramsLoading() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status" aria-live="polite">' +
      '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
      '<p>Loading available programs&hellip;</p>' +
    '</div>';
}

function showProgramsEmpty() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status">' +
      '<i class="fa-solid fa-house" aria-hidden="true"></i>' +
      '<p>Program details are being updated. Please check back shortly or <a href="contact.html">contact us</a> for current availability.</p>' +
    '</div>';
}

function showProgramsError() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="alert">' +
      '<i class="fa-solid fa-house-circle-exclamation" aria-hidden="true"></i>' +
      '<p>Program information is temporarily unavailable. Please <a href="contact.html">contact us</a> or check back shortly.</p>' +
    '</div>';
}

function showProgramsPlaceholder() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status">' +
      '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
      '<p>Program details are coming soon. <a href="contact.html">Join the interest list</a> to be notified when communities become available.</p>' +
    '</div>';
}

/* ---------------------------------------------------------
   CSV Parser (same logic as listings.js)
   --------------------------------------------------------- */
function parseCSVToObjects(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  var headers = parseCSVRow(lines[0]);
  var rows = [];

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var values = parseCSVRow(line);
    var obj = {};
    headers.forEach(function(header, idx) {
      obj[header.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVRow(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    var next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ---------------------------------------------------------
   Utility
   --------------------------------------------------------- */
function escHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
