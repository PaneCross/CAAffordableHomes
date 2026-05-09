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

  Promise.all([
    fetch(SUPABASE_URL + '/rest/v1/programs?status=in.("Available","Coming Soon")&order=area.asc&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }),
    fetch(SUPABASE_URL + '/rest/v1/rpc/get_program_unit_counts', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : [] }).catch(function () { return [] })
  ])
    .then(function (results) {
      var rows   = results[0]
      var counts = results[1]

      if (!rows || rows.length === 0) { showProgramsEmpty(); return }

      var unitMap = {}
      if (Array.isArray(counts)) {
        counts.forEach(function (c) {
          if (c.program_name) unitMap[c.program_name] = Number(c.available_units) || 0
        })
      }
      renderPrograms(rows, unitMap)
    })
    .catch(function (err) {
      console.error('[CA Affordable Homes] programs.js failed to load:', err)
      showProgramsError()
    })
}

/* ---------------------------------------------------------
   Render
   --------------------------------------------------------- */
function renderPrograms(rows, unitMap) {
  programsGrid.innerHTML = ''
  var hasMls = false

  rows.forEach(function (row) {
    programsGrid.appendChild(buildProgramCard(row, unitMap || {}))
    if (row['mls_listed'] === true) hasMls = true
  })

  /* MLS attribution — injected below grid only when at least one program is MLS-listed */
  var attrContainer = document.getElementById('mls-attribution-container')
  if (attrContainer) {
    attrContainer.innerHTML = hasMls
      ? '<p class="pc-mls-attribution" role="note">' +
          '<i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' +
          'Where applicable, property information is sourced from the San Diego Association of Realtors (SDAR). ' +
          'Information deemed reliable but not guaranteed.' +
        '</p>'
      : ''
  }
}

function buildProgramCard(row, unitMap) {
  var area            = (row['area']              || '').trim()
  var communityName   = (row['community_name']    || '').trim()
  var propertyType    = (row['property_type']     || '').trim()
  var amiPercent      = row['ami_percent'] != null ? String(row['ami_percent']).trim() : ''
  var zipCode         = (row['zip_code']          || '').trim()
  var bedrooms        = (row['bedrooms']          || '').trim()
  var bathrooms       = (row['bathrooms']         || '').trim()
  var priceRange      = (row['price_range']       || '').trim()
  var householdSize   = (row['household_size']    || '').trim()
  var status          = (row['status']            || 'Available').trim()
  var notes           = (row['notes']             || '').trim()
  var mlsListed       = row['mls_listed'] === true
  var fullAddress     = (row['full_address']      || '').trim()
  var parking         = (row['parking']           || '').trim()
  var sqft            = (row['sqft']              || '').trim()
  var programType     = (row['program_type']      || '').trim()
  var selectionProc   = (row['selection_process'] || '').trim()
  var availUnits      = (unitMap && communityName) ? (unitMap[communityName] || 0) : 0

  var statusLower = status.toLowerCase()
  var isAvail     = statusLower === 'available'
  var badgeClass  = isAvail ? 'pc-badge--available' : 'pc-badge--soon'
  var cardAccent  = isAvail ? 'program-card--available' : 'program-card--soon'

  /* Units line sits under the title inside the title block */
  var unitsLineHTML = (isAvail && availUnits > 0)
    ? '<p class="pc-units-line">' +
        '<i class="fa-solid fa-house-chimney" aria-hidden="true"></i> ' +
        availUnits + (availUnits === 1 ? ' home available' : ' homes available') +
      '</p>'
    : ''

  /* MLS badge + address/zip row — always shown */
  var mlsBadgeClass = mlsListed ? 'pc-mls-badge--listed' : 'pc-mls-badge--not-listed'
  var mlsBadgeLabel = mlsListed
    ? '<i class="fa-solid fa-list-check" aria-hidden="true"></i> Listed on MLS'
    : 'Not Listed on MLS'
  var locationText = fullAddress || (zipCode ? 'Zip: ' + zipCode : '')
  var mlsRowHTML =
    '<div class="pc-mls-row">' +
      '<span class="pc-mls-badge ' + mlsBadgeClass + '">' + mlsBadgeLabel + '</span>' +
      (locationText
        ? '<span class="pc-address-line"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHTML(locationText) + '</span>'
        : '') +
    '</div>'

  /* Property specs row — beds, baths, sqft, parking as compact pill tags */
  var specParts = []
  if (bedrooms)  specParts.push('<span class="pc-spec-tag"><i class="fa-solid fa-bed" aria-hidden="true"></i> ' + escHTML(bedrooms) + ' bd</span>')
  if (bathrooms) specParts.push('<span class="pc-spec-tag"><i class="fa-solid fa-bath" aria-hidden="true"></i> ' + escHTML(bathrooms) + ' ba</span>')
  if (sqft)      specParts.push('<span class="pc-spec-tag"><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> ' + escHTML(sqft) + ' sqft</span>')
  if (parking)   specParts.push('<span class="pc-spec-tag"><i class="fa-solid fa-square-parking" aria-hidden="true"></i> ' + escHTML(parking) + '</span>')
  var specsRowHTML = specParts.length > 0
    ? '<div class="pc-specs-row">' + specParts.join('') + '</div>'
    : ''

  /* Detail rows — compliance and program info */
  var detailsHTML = ''
  if (amiPercent)    detailsHTML += detailRow('fa-percent',    'AMI Limit',         'Up to ' + amiPercent + '%')
  if (propertyType)  detailsHTML += detailRow('fa-house',      'Property Type',     propertyType)
  if (householdSize) detailsHTML += detailRow('fa-people-group','Household Size',   householdSize)
  if (priceRange)    detailsHTML += detailRow('fa-tag',        'Price Range',       priceRange)
  if (programType)   detailsHTML += detailRow('fa-building',   'Program Type',      programType)
  if (selectionProc) detailsHTML += detailRow('fa-list-ol',    'Selection Process', selectionProc)

  var card = document.createElement('article')
  card.className = 'program-card ' + cardAccent

  card.innerHTML =
    '<div class="pc-header">' +
      '<div class="pc-title-block">' +
        '<h3 class="pc-name">' + escHTML(area || 'San Diego Area') + '</h3>' +
        unitsLineHTML +
      '</div>' +
      '<span class="pc-badge ' + badgeClass + '">' + escHTML(status) + '</span>' +
    '</div>' +
    mlsRowHTML +
    specsRowHTML +
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
