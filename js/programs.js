/* =========================================================
   CA Affordable Homes — programs.js
   Fetches program criteria from Supabase and renders cards.
   Area = website card title (community_name is admin-only).
   ========================================================= */

var SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
var SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
var programsGrid = document.getElementById('programs-grid')
if (programsGrid) loadPrograms()

/* ---------------------------------------------------------
   Fetch + render
   --------------------------------------------------------- */
function loadPrograms() {
  showProgramsLoading()

  fetch(SUPABASE_URL + '/rest/v1/programs?status=in.("Available","Coming Soon")&order=area.asc&select=*', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
    .then(function (rows) {
      if (!rows || rows.length === 0) {
        showProgramsEmpty()
      } else {
        renderPrograms(rows)
      }
    })
    .catch(function (err) {
      console.error('[CA Affordable Homes] programs.js failed to load:', err)
      showProgramsError()
    })
}

/* ---------------------------------------------------------
   Render
   --------------------------------------------------------- */
function renderPrograms(rows) {
  programsGrid.innerHTML = ''
  rows.forEach(function (row) {
    programsGrid.appendChild(buildProgramCard(row))
  })
}

function buildProgramCard(row) {
  var area         = (row['area']          || '').trim()
  var propertyType = (row['property_type'] || '').trim()
  var amiPercent   = row['ami_percent'] != null ? String(row['ami_percent']).trim() : ''
  var zipCode      = (row['zip_code']      || '').trim()
  var bedrooms     = (row['bedrooms']      || '').trim()
  var priceRange   = (row['price_range']   || '').trim()
  var status       = (row['status']        || 'Available').trim()
  var notes        = (row['notes']         || '').trim()

  var statusLower = status.toLowerCase()
  var isAvail = statusLower === 'available'
  var badgeClass  = isAvail ? 'pc-badge--available' : 'pc-badge--soon'
  var cardAccent  = isAvail ? 'program-card--available' : 'program-card--soon'

  /* AMI tag */
  var amiTagHTML = amiPercent
    ? '<span class="pc-ami-tag">Up to ' + escHTML(amiPercent) + '% AMI</span>'
    : ''

  /* Detail rows */
  var detailsHTML = ''
  if (propertyType) detailsHTML += detailRow('fa-house',       'Property Type', propertyType)
  if (zipCode)      detailsHTML += detailRow('fa-location-dot','Zip Code',      zipCode)
  if (bedrooms)     detailsHTML += detailRow('fa-bed',         'Bedrooms',      bedrooms)
  if (priceRange)   detailsHTML += detailRow('fa-tag',         'Price Range',   priceRange)

  var card = document.createElement('article')
  card.className = 'program-card ' + cardAccent

  card.innerHTML =
    '<div class="pc-header">' +
      '<div class="pc-title-block">' +
        '<h3 class="pc-name">' + escHTML(area || 'San Diego Area') + '</h3>' +
      '</div>' +
      '<span class="pc-badge ' + badgeClass + '">' + escHTML(status) + '</span>' +
    '</div>' +
    (amiTagHTML ? '<div class="pc-ami-row">' + amiTagHTML + '</div>' : '') +
    (detailsHTML ? '<ul class="pc-details" role="list">' + detailsHTML + '</ul>' : '') +
    (notes
      ? '<div class="pc-notes"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' + escHTML(notes) + '</div>'
      : '')

  return card
}

function detailRow(icon, label, value) {
  return (
    '<li class="pc-detail-row">' +
      '<span class="pc-detail-label">' +
        '<i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + label +
      '</span>' +
      '<span class="pc-detail-value">' + escHTML(value) + '</span>' +
    '</li>'
  )
}

/* ---------------------------------------------------------
   State messages
   --------------------------------------------------------- */
function showProgramsLoading() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status" aria-live="polite">' +
      '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
      '<p>Loading available programs&hellip;</p>' +
    '</div>'
}

function showProgramsEmpty() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status">' +
      '<i class="fa-solid fa-house" aria-hidden="true"></i>' +
      '<p>Program details are being updated. Please check back shortly or <a href="contact.html">contact us</a> for current availability.</p>' +
    '</div>'
}

function showProgramsError() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="alert">' +
      '<i class="fa-solid fa-house-circle-exclamation" aria-hidden="true"></i>' +
      '<p>Program information is temporarily unavailable. Please <a href="contact.html">contact us</a> or check back shortly.</p>' +
    '</div>'
}

/* ---------------------------------------------------------
   Utility
   --------------------------------------------------------- */
function escHTML(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;')
}
