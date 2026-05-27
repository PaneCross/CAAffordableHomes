/* =========================================================
   CA Affordable Homes — programs.js  (Phase 18 rewrite)
   Fetches public listings from Supabase and renders cards
   with expanded popup and AMI income limits tables.
   ========================================================= */

var SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
var SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'

/* ---------------------------------------------------------
   2025 San Diego County AMI Income Limits
   Source: HUD, Effective 04/1/2025 (Revised 4/16/2025)
   Adjusted for High Housing Cost Area for limits 80% and below.
   Median Family Income: $130,800
   --------------------------------------------------------- */
var AMI_TABLES = {
  t1: {
    title: 'Extremely Low / Very Low Income',
    cols:  ['30%', '35%', '40%', '50%'],
    keys:  [30, 35, 40, 50],
    rows: [
      [34750, 40550, 46350, 57900],
      [39700, 46350, 52950, 66150],
      [44650, 52150, 59550, 74450],
      [49600, 57900, 66150, 82700],
      [53600, 62550, 71450, 89350],
      [57550, 67200, 76750, 95950],
      [61550, 71800, 82050, 102550],
      [65500, 76450, 87350, 109200]
    ]
  },
  t2: {
    title: 'Low Income',
    cols:  ['60%', '65%', '70%', '80%'],
    keys:  [60, 65, 70, 80],
    rows: [
      [69480, 75250, 81050, 92700],
      [79380, 86000, 92650, 105950],
      [89340, 96750, 104200, 119200],
      [99240, 107500, 115800, 132400],
      [107220, 116100, 125050, 143000],
      [115140, 124700, 134350, 153600],
      [123060, 133300, 143600, 164200],
      [131040, 141900, 152850, 174800]
    ]
  },
  t3: {
    title: 'Moderate Income',
    cols:  ['90%', '100%', '110%', '120%'],
    keys:  [90, 100, 110, 120],
    rows: [
      [82400, 91550, 100750, 109850],
      [94150, 104650, 115100, 125550],
      [105950, 117700, 129500, 141250],
      [117700, 130800, 143900, 156950],
      [127100, 141250, 155400, 169500],
      [136550, 151750, 166900, 182050],
      [145950, 162200, 178450, 194600],
      [155350, 172650, 189950, 207150]
    ]
  }
}

var HH_LABELS = ['1 Person','2 People','3 People','4 People','5 People','6 People','7 People','8 People']

/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */
var allListings = []
var activeFilter = { area: '', beds: '', ami: '' }
var expandedPopupOpen = false

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
var programsGrid = document.getElementById('programs-grid')
if (programsGrid) loadListings()

/* Build popup overlay once */
buildPopupOverlay()

/* ---------------------------------------------------------
   Fetch
   --------------------------------------------------------- */
function loadListings() {
  showLoading()
  fetch(
    SUPABASE_URL + '/rest/v1/listings?show_on_site=eq.true&order=city.asc',
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
  )
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
    .then(function (rows) {
      allListings = rows || []
      buildFilterOptions()
      renderListings()
    })
    .catch(function (err) {
      console.error('[CA Affordable Homes] listings failed to load:', err)
      showError()
    })
}

/* ---------------------------------------------------------
   Filters
   --------------------------------------------------------- */
function buildFilterOptions() {
  /* Area / City */
  var areas = []
  allListings.forEach(function (r) {
    var a = (r.city || '').trim()
    if (a && areas.indexOf(a) === -1) areas.push(a)
  })
  areas.sort()
  var areaEl = document.getElementById('lst-filter-area')
  if (areaEl) {
    areaEl.innerHTML = '<option value="">All Areas</option>'
      + areas.map(function (a) { return '<option value="' + escHTMLAttr(a) + '">' + escHTML(a) + '</option>' }).join('')
  }

  /* Populate bedrooms options dynamically */
  var beds = []
  allListings.forEach(function (r) {
    var b = parseInt(r.bedrooms) || 0
    if (b && beds.indexOf(b) === -1) beds.push(b)
  })
  beds.sort(function (a, b) { return a - b })
  var bedEl = document.getElementById('lst-filter-beds')
  if (bedEl) {
    bedEl.innerHTML = '<option value="">Any Beds</option>'
      + beds.map(function (b) {
          return '<option value="' + b + '">' + b + (b >= 4 ? '+ BR' : ' BR') + '</option>'
        }).join('')
  }
}

function applyFilters() {
  activeFilter.area = (document.getElementById('lst-filter-area') || {}).value || ''
  activeFilter.beds = (document.getElementById('lst-filter-beds') || {}).value || ''
  activeFilter.ami  = (document.getElementById('lst-filter-ami')  || {}).value || ''
  renderListings()
}

function filteredListings() {
  return allListings.filter(function (r) {
    if (activeFilter.area && (r.city || '').trim() !== activeFilter.area) return false
    if (activeFilter.beds) {
      var b = parseInt(r.bedrooms) || 0
      if (activeFilter.beds === '4') { if (b < 4) return false }
      else { if (b !== parseInt(activeFilter.beds)) return false }
    }
    if (activeFilter.ami) {
      var ap = r.ami_percent ? parseInt(r.ami_percent) : null
      if (activeFilter.ami === 'low')  { if (!ap || ap > 50)  return false }
      if (activeFilter.ami === 'mid')  { if (!ap || ap < 51 || ap > 80)  return false }
      if (activeFilter.ami === 'mod')  { if (!ap || ap < 81)  return false }
    }
    return true
  })
}

/* ---------------------------------------------------------
   Render cards
   --------------------------------------------------------- */
function renderListings() {
  var rows = filteredListings()

  if (!allListings.length) { showEmpty(); return }
  if (!rows.length) {
    programsGrid.innerHTML =
      '<div class="programs-status" role="status">' +
        '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
        '<p>No listings match your filters. <button class="lst-clear-link" onclick="clearFilters()">Clear all filters</button></p>' +
      '</div>'
    return
  }

  var cards = rows.map(function (row, i) {
    return buildListingCard(row, i)
  }).join('')

  programsGrid.innerHTML = '<div class="lst-cards-grid">' + cards + '</div>'

  /* Attach click handlers */
  programsGrid.querySelectorAll('.lst-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var idx = parseInt(card.dataset.idx)
      openPopup(rows[idx])
    })
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        var idx = parseInt(card.dataset.idx)
        openPopup(rows[idx])
      }
    })
  })
}

function buildListingCard(r, idx) {
  var status     = (r.public_status || 'Available').trim()
  var mls        = r.mls_listed === true
  var isAvail    = status.toLowerCase() === 'available'
  var badgeCls   = isAvail ? 'lst-badge--avail' : 'lst-badge--soon'
  var cardAccent = isAvail ? 'lst-card--avail'  : 'lst-card--soon'

  /* Card title and location line differ by MLS status */
  var cardTitle, locationLine
  if (mls) {
    cardTitle    = (r.community_name || r.city || 'San Diego Area').trim()
    locationLine = (r.address || [r.city, r.zip_code].filter(Boolean).join(', ') || '').trim()
  } else {
    cardTitle    = (r.area || r.city || 'San Diego Area').trim()
    locationLine = [r.city, r.zip_code].filter(Boolean).join(' ')
  }

  var mlsLabel = mls
    ? '<span class="lst-mls-tag lst-mls-tag--yes"><i class="fa-solid fa-list-check" aria-hidden="true"></i> MLS</span>'
    : '<span class="lst-mls-tag">Not on MLS</span>'

  /* Physical specs pills: beds / baths / sqft / parking */
  var specPills = []
  if (r.bedrooms)  specPills.push('<span><i class="fa-solid fa-bed"            aria-hidden="true"></i> ' + escHTML(String(r.bedrooms))  + ' bd</span>')
  if (r.bathrooms) specPills.push('<span><i class="fa-solid fa-bath"           aria-hidden="true"></i> ' + escHTML(String(r.bathrooms)) + ' ba</span>')
  if (r.sqft)      specPills.push('<span><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> ' + escHTML(String(r.sqft))      + ' sqft</span>')
  if (r.parking)   specPills.push('<span><i class="fa-solid fa-square-parking" aria-hidden="true"></i> ' + escHTML(r.parking)           + '</span>')
  var specsHTML = specPills.length ? '<div class="lst-card-specs">' + specPills.join('') + '</div>' : ''

  /* Detail rows: Price (MLS only), Home Type, AMI Limit */
  var detailRows = ''
  if (mls && r.price)  detailRows += cardDetail('fa-tag',          'Price',     '$' + Number(r.price).toLocaleString('en-US'))
  if (r.home_type)     detailRows += cardDetail('fa-house',        'Home Type', r.home_type)
  if (r.ami_percent)   detailRows += cardDetail('fa-chart-simple', 'AMI Limit', 'Up to ' + r.ami_percent + '%')
  var detailsHTML = detailRows ? '<ul class="lst-card-details">' + detailRows + '</ul>' : ''

  /* Comments snippet (max 2 lines via CSS clamp) */
  var comments = (r.comments || '').trim()
  var commentsHTML = comments
    ? '<div class="lst-card-comments">' + escHTML(comments) + '</div>'
    : ''

  return '<article class="lst-card ' + cardAccent + '" data-idx="' + idx + '" tabindex="0" role="button" aria-label="View details for ' + escHTMLAttr(cardTitle) + '">'
    + '<div class="lst-card-header">'
    +   '<div class="lst-card-title-row">'
    +     '<h3 class="lst-card-name">' + escHTML(cardTitle) + '</h3>'
    +     '<span class="lst-badge ' + badgeCls + '">' + escHTML(status) + '</span>'
    +   '</div>'
    +   '<div class="lst-card-sub">' + (locationLine ? escHTML(locationLine) + ' &bull; ' : '') + mlsLabel + '</div>'
    + '</div>'
    + specsHTML
    + detailsHTML
    + commentsHTML
    + '<div class="lst-card-cta"><span>View Details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></div>'
    + '</article>'
}

function cardDetail(icon, label, value) {
  return '<li class="lst-card-detail-row">'
    + '<span class="lst-card-detail-label"><i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + label + '</span>'
    + '<span class="lst-card-detail-value">' + escHTML(String(value)) + '</span>'
    + '</li>'
}

/* ---------------------------------------------------------
   Popup overlay
   --------------------------------------------------------- */
function buildPopupOverlay() {
  var overlay = document.createElement('div')
  overlay.id = 'lst-popup-overlay'
  overlay.className = 'lst-popup-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'lst-popup-title')
  overlay.innerHTML =
    '<div class="lst-popup-box" id="lst-popup-box">'
    + '<button class="lst-popup-close" id="lst-popup-close" aria-label="Close listing details"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>'
    + '<div class="lst-popup-body" id="lst-popup-body"></div>'
    + '</div>'
  document.body.appendChild(overlay)

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closePopup()
  })
  document.getElementById('lst-popup-close').addEventListener('click', closePopup)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && expandedPopupOpen) closePopup()
  })
}

function openPopup(r) {
  document.getElementById('lst-popup-body').innerHTML = buildPopupHTML(r)
  document.getElementById('lst-popup-overlay').classList.add('open')
  document.getElementById('lst-popup-box').scrollTop = 0
  expandedPopupOpen = true
  document.body.style.overflow = 'hidden'
}

function closePopup() {
  document.getElementById('lst-popup-overlay').classList.remove('open')
  expandedPopupOpen = false
  document.body.style.overflow = ''
}

function buildPopupHTML(r) {
  var status   = (r.public_status || 'Available').trim()
  var isAvail  = status.toLowerCase() === 'available'
  var mls      = r.mls_listed === true
  var badgeCls = isAvail ? 'lst-badge--avail' : 'lst-badge--soon'

  /* Pull all fields */
  var communityName = (r.community_name || '').trim()
  var area          = (r.area           || '').trim()
  var city          = (r.city           || '').trim()
  var zip           = (r.zip_code       || '').trim()
  var address       = (r.address        || '').trim()
  var homeType      = (r.home_type      || '').trim()
  var price         = r.price ? '$' + Number(r.price).toLocaleString('en-US') : ''
  var amiPct        = r.ami_percent ? parseInt(r.ami_percent) : null
  var beds          = (r.bedrooms       || '').toString().trim()
  var baths         = (r.bathrooms      || '').toString().trim()
  var sqft          = (r.sqft           || '').toString().trim()
  var parking       = (r.parking        || '').trim()
  var programType   = (r.program_type   || '').trim()
  var features      = (r.features       || '').trim()
  var minHH         = r.min_household_size ? String(r.min_household_size) : ''
  var comments      = (r.comments       || '').trim()

  /* ── Popup title + location ─────────────────────────────── */
  var popupTitle, locationLine, mlsBadge
  if (mls) {
    popupTitle   = communityName || city || 'San Diego Area'
    locationLine = address || [city, zip].filter(Boolean).join(', ')
    mlsBadge     = '<span class="pc-mls-badge pc-mls-badge--listed"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Listed on MLS</span>'
  } else {
    popupTitle   = area || city || 'San Diego Area'
    locationLine = ''   /* city and area shown in details list below */
    mlsBadge     = '<span class="pc-mls-badge pc-mls-badge--not-listed">Not Listed on MLS</span>'
  }

  /* ── Specs pill row (beds / baths / sqft / parking) ─────── */
  var specs = []
  if (beds)    specs.push('<span class="pc-spec-tag"><i class="fa-solid fa-bed"           aria-hidden="true"></i> ' + escHTML(beds)    + ' bd</span>')
  if (baths)   specs.push('<span class="pc-spec-tag"><i class="fa-solid fa-bath"          aria-hidden="true"></i> ' + escHTML(baths)   + ' ba</span>')
  if (sqft)    specs.push('<span class="pc-spec-tag"><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> ' + escHTML(sqft)    + ' sqft</span>')
  if (parking) specs.push('<span class="pc-spec-tag"><i class="fa-solid fa-square-parking" aria-hidden="true"></i> ' + escHTML(parking) + '</span>')
  var specsHTML = specs.length ? '<div class="pc-specs-row">' + specs.join('') + '</div>' : ''

  /* ── Details list — fields differ by MLS status ─────────── */
  var details = ''
  if (mls) {
    /* MLS: Community name, Address, Home Type, Price, AMI%, Min HH size */
    if (communityName) details += popupDetail('fa-building',   'Community',    communityName)
    if (address)       details += popupDetail('fa-location-dot','Address',     address)
    if (homeType)      details += popupDetail('fa-house',       'Home Type',   homeType)
    if (price)         details += popupDetail('fa-tag',         'Price',       price)
    if (amiPct)        details += popupDetail('fa-chart-simple', 'AMI Limit',   'Up to ' + amiPct + '%')
    if (programType)   details += popupDetail('fa-clipboard',   'Program Type', programType)
    if (minHH)         details += popupDetail('fa-users',       'Min. Household Size', minHH + ' person' + (parseInt(minHH) !== 1 ? 's' : ''))
  } else {
    /* Non-MLS: Area, City, Home Type, AMI%, Min HH size (no address, no price) */
    if (area)          details += popupDetail('fa-map',         'Area',        area)
    if (city)          details += popupDetail('fa-location-dot','City',        city + (zip ? ' ' + zip : ''))
    if (homeType)      details += popupDetail('fa-house',       'Home Type',   homeType)
    if (amiPct)        details += popupDetail('fa-chart-simple', 'AMI Limit',   'Up to ' + amiPct + '%')
    if (programType)   details += popupDetail('fa-clipboard',   'Program Type', programType)
    if (minHH)         details += popupDetail('fa-users',       'Min. Household Size', minHH + ' person' + (parseInt(minHH) !== 1 ? 's' : ''))
  }

  /* ── Features bullet list ───────────────────────────────── */
  var featuresHTML = ''
  if (features) {
    var bullets = features.split('\n').map(function (f) { return f.trim() }).filter(Boolean)
    if (bullets.length) {
      featuresHTML = '<div class="lst-popup-section">'
        + '<div class="lst-popup-section-title">Key Features</div>'
        + '<ul class="lst-features-list">' + bullets.map(function (b) { return '<li>' + escHTML(b) + '</li>' }).join('') + '</ul>'
        + '</div>'
    }
  }

  /* ── Comments ───────────────────────────────────────────── */
  var commentsHTML = comments
    ? '<div class="lst-popup-section">'
        + '<div class="lst-popup-section-title">Comments</div>'
        + '<p class="lst-popup-comments">' + escHTML(comments) + '</p>'
      + '</div>'
    : ''

  /* ── AMI income limits tables ───────────────────────────── */
  var amiTablesHTML = buildAMITablesHTML(amiPct)

  /* ── MLS attribution (only when MLS listed) ─────────────── */
  var mlsAttr = mls
    ? '<p class="pc-mls-attribution" style="margin-top:1.5rem;"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Property information is sourced from the San Diego Association of Realtors (SDAR). Information deemed reliable but not guaranteed.</p>'
    : ''

  return '<div class="lst-popup-header">'
    +   '<div class="lst-popup-title-row">'
    +     '<h2 id="lst-popup-title">' + escHTML(popupTitle) + '</h2>'
    +     '<span class="lst-badge ' + badgeCls + '" style="flex-shrink:0;">' + escHTML(status) + '</span>'
    +   '</div>'
    +   '<div class="lst-popup-meta">'
    +     mlsBadge
    +     (locationLine ? '<span class="lst-popup-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escHTML(locationLine) + '</span>' : '')
    +   '</div>'
    + '</div>'
    + specsHTML
    + (details ? '<ul class="pc-details" role="list">' + details + '</ul>' : '')
    + featuresHTML
    + commentsHTML
    + amiTablesHTML
    + mlsAttr
    + '<div class="lst-popup-cta">'
    +   '<p>Interested in this opportunity?</p>'
    +   '<a href="contact.html" class="btn btn-primary"><i class="fa-solid fa-list" aria-hidden="true"></i> Join the Interest List</a>'
    + '</div>'
}

function popupDetail(icon, label, value) {
  return '<li class="pc-detail-row">'
    + '<span class="pc-detail-label"><i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + label + '</span>'
    + '<span class="pc-detail-value">' + escHTML(String(value)) + '</span>'
    + '</li>'
}

/* ---------------------------------------------------------
   AMI Tables HTML
   --------------------------------------------------------- */
function buildAMITablesHTML(highlightPct) {
  var tablesHTML = Object.keys(AMI_TABLES).map(function (key) {
    var tbl = AMI_TABLES[key]
    var thead = '<thead><tr><th>Family Size</th>'
      + tbl.cols.map(function (col, ci) {
          var isHL = highlightPct && tbl.keys[ci] === highlightPct
          return '<th' + (isHL ? ' class="ami-col-highlight"' : '') + '>' + col + (isHL ? ' <span class="ami-hl-star" aria-label="This listing\'s AMI level">&#9733;</span>' : '') + '</th>'
        }).join('') + '</tr></thead>'
    var tbody = '<tbody>' + tbl.rows.map(function (row, ri) {
        return '<tr><td class="ami-hh-cell">' + HH_LABELS[ri] + '</td>'
          + row.map(function (val, ci) {
              var isHL = highlightPct && tbl.keys[ci] === highlightPct
              return '<td' + (isHL ? ' class="ami-col-highlight"' : '') + '>$' + val.toLocaleString('en-US') + '</td>'
            }).join('') + '</tr>'
      }).join('') + '</tbody>'
    return '<div class="ami-tbl-wrap">'
      + '<div class="ami-tbl-title">' + tbl.title + '</div>'
      + '<div class="ami-tbl-scroll"><table class="ami-public-table">' + thead + tbody + '</table></div>'
      + '</div>'
  }).join('')

  return '<div class="lst-popup-section lst-popup-ami">'
    + '<div class="lst-popup-section-title">2025 San Diego County Income Limits'
    + (highlightPct ? ' <span class="ami-hl-note">(&#9733; = this listing\'s AMI level)</span>' : '')
    + '</div>'
    + '<p class="ami-disclaimer">Effective 04/1/2025. San Diego County Median Family Income: $130,800. Limits at 80% and below are adjusted for High Housing Cost Area.</p>'
    + tablesHTML
    + '</div>'
}

/* ---------------------------------------------------------
   Filter controls wiring (called from programs.html inline)
   --------------------------------------------------------- */
function clearFilters() {
  var areaEl = document.getElementById('lst-filter-area')
  var bedEl  = document.getElementById('lst-filter-beds')
  var amiEl  = document.getElementById('lst-filter-ami')
  if (areaEl) areaEl.value = ''
  if (bedEl)  bedEl.value  = ''
  if (amiEl)  amiEl.value  = ''
  activeFilter = { area: '', beds: '', ami: '' }
  renderListings()
}

/* ---------------------------------------------------------
   State messages
   --------------------------------------------------------- */
function showLoading() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status" aria-live="polite">' +
      '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
      '<p>Loading available listings&hellip;</p>' +
    '</div>'
}

function showEmpty() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="status">' +
      '<i class="fa-solid fa-house" aria-hidden="true"></i>' +
      '<p>Listing details are being updated. Please check back shortly or <a href="contact.html">contact us</a> for current availability.</p>' +
    '</div>'
}

function showError() {
  programsGrid.innerHTML =
    '<div class="programs-status" role="alert">' +
      '<i class="fa-solid fa-house-circle-exclamation" aria-hidden="true"></i>' +
      '<p>Listing information is temporarily unavailable. Please <a href="contact.html">contact us</a> or check back shortly.</p>' +
    '</div>'
}

/* ---------------------------------------------------------
   Utility
   --------------------------------------------------------- */
function escHTML(str) {
  if (!str && str !== 0) return ''
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;')
}

function escHTMLAttr(str) {
  return escHTML(str)
}
