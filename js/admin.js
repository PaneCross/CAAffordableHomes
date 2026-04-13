// =============================================================
// CA Affordable Homes — Admin JS
// Supabase-backed admin portal. No Apps Script required.
// =============================================================

const SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'
const SUBMIT_FN    = `${SUPABASE_URL}/functions/v1/submit-interest`

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit' }
})

// ── State ─────────────────────────────────────────────────────
let lstData = [], progData = [], ilData = [], psData = [], candidatesData = [], successesData = []
let dashboardFetched = false
let helpPanelOpen = false
let editingLstRow = null, editingProgRow = null, editingPsRow = null, viewingIlRow = null
let lstFilter = 'active', progFilter = 'active', ilFilter = 'all', psFilter = 'all'
let ilSearch = ''
let promotingPsId = null  // PS row id when promoting to listing
let ilSort  = { col: 'submitted_at', asc: false }
let psSort  = { col: 'submitted_at', asc: false }


// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
let appInitialized = false

sb.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showApp(session)
  } else {
    showLogin()
  }
})

// Handle OAuth callback — if access_token is in the URL hash, set session manually
const _hash = window.location.hash
if (_hash && _hash.includes('access_token=')) {
  // Strip any leading tab hash (e.g. #programs#access_token= → access_token=...)
  const _oauthStart = _hash.indexOf('access_token=')
  const _params = new URLSearchParams(_hash.substring(_oauthStart))
  const _accessToken  = _params.get('access_token')
  const _refreshToken = _params.get('refresh_token')
  sb.auth.setSession({ access_token: _accessToken, refresh_token: _refreshToken || '' })
    .then(({ data, error }) => {
      if (data?.session) {
        history.replaceState(null, '', window.location.pathname)
        showApp(data.session)
      } else {
        showLogin()
      }
    })
} else {
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session) showApp(session)
    else showLogin()
  })
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
function showLogin() {
  appInitialized = false
  document.getElementById('login-screen').style.display = 'flex'
  document.getElementById('app').style.display = 'none'
}

function showApp(session) {
  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('app').style.display = 'flex'
  document.getElementById('sb-user-email').textContent = session.user.email
  if (!appInitialized) {
    appInitialized = true
    // Use switchTab so the correct panel is shown AND its data is loaded.
    // loadActiveTab alone loads data but never hides the default dashboard panel,
    // so if the URL hash was #listings the user would see the dashboard baked-in
    // spinner forever while listings data loaded silently in the background.
    const initialTab = location.hash.replace('#', '') || 'dashboard'
    switchTab(initialTab)
  }
}

document.getElementById('google-login-btn').addEventListener('click', async () => {
  const btn   = document.getElementById('google-login-btn')
  const errEl = document.getElementById('login-error')
  errEl.style.display = 'none'
  btn.disabled = true
  btn.textContent = 'Redirecting...'

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })

  if (error) {
    errEl.textContent = error.message
    errEl.style.display = 'block'
    btn.disabled = false
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google`
  }
})

document.getElementById('logout-btn').addEventListener('click', () => sb.auth.signOut())

// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────
const TAB_TITLES = {
  dashboard:     'Dashboard',
  properties:    'Property Submissions',
  listings:      'Listings',
  programs:      'Programs',
  'interest-list': 'Interest List',
  matches:       'Matches',
  successes:     'Successes',
}

document.querySelectorAll('.sb-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

function switchTab(tab) {
  document.querySelectorAll('.sb-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.admin-tab').forEach(s => s.style.display = 'none')
  const el = document.getElementById(`tab-${tab}`)
  if (el) el.style.display = 'block'
  document.getElementById('page-title').textContent = TAB_TITLES[tab] || tab
  loadActiveTab(tab)
  history.replaceState(null, '', `#${tab}`)
  if (helpPanelOpen) populateHelpPanel(tab)
}

function loadActiveTab(tab) {
  tab = tab || location.hash.replace('#','') || 'dashboard'
  if (tab === 'dashboard')     { if (!dashboardFetched) loadDashboard(); else renderDashboard() }
  if (tab === 'properties')    { if (!psData.length)   loadPS();           else renderPS()           }
  if (tab === 'listings')      { if (!lstData.length)  loadListings();     else renderListings()     }
  if (tab === 'programs')      { if (!progData.length) loadPrograms();     else renderPrograms()     }
  if (tab === 'interest-list') { if (!ilData.length)   loadInterestList(); else renderIL()           }
  if (tab === 'matches')       loadMatches()
  if (tab === 'successes')     loadSuccesses()
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  const tab = document.querySelector('.sb-btn.active[data-tab]')?.dataset.tab || 'dashboard'
  lstData = []; progData = []; ilData = []; psData = []; candidatesData = []; successesData = []
  dashboardFetched = false
  loadActiveTab(tab)
})

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (dashboardFetched) { renderDashboard(); return }

  setArea('dashboard-area', loading())
  try {
    // Sequential queries — avoids connection pool exhaustion during cold start.
    const ilRes = await sb.from('interest_list').select('*').order('submitted_at', { ascending: false })
    if (ilRes.error) throw ilRes.error

    const lstRes = await sb.from('listings').select('*').order('created_at', { ascending: false })
    if (lstRes.error) throw lstRes.error

    const progRes = await sb.from('programs').select('*').order('created_at', { ascending: false })
    if (progRes.error) throw progRes.error

    const psRes = await sb.from('property_submissions').select('*').order('submitted_at', { ascending: false })
    if (psRes.error) throw psRes.error

    ilData   = ilRes.data   || []
    lstData  = lstRes.data  || []
    progData = progRes.data || []
    psData   = psRes.data   || []
    dashboardFetched = true

    renderDashboard()
  } catch (err) {
    setArea('dashboard-area', errorState(err))
  }
}

function renderDashboard() {
  const ilCounts   = countBy(ilData,   'status')
  const psCounts   = countBy(psData,   'status')
  const lstActive  = lstData.filter(r => r.active === 'YES').length
  const lstLinked  = lstData.filter(r => r.linked_program_id).length
  const progAvail  = progData.filter(r => r.status === 'Available').length
  const progSoon   = progData.filter(r => r.status === 'Coming Soon').length
  const psPromoted = psCounts['promoted'] || 0

  setArea('dashboard-area', `
    <div class="dash-pipeline-wrap">
      <div class="pipeline-stage" data-nav="properties">
        <div class="pipeline-icon"><i class="fa-solid fa-inbox"></i></div>
        <div class="pipeline-label">Submissions</div>
        <div class="pipeline-nums"><span class="pipeline-highlight">${psData.length - psPromoted}</span> pending</div>
        <div class="pipeline-nums">${psData.length} total &bull; ${psPromoted} promoted</div>
      </div>
      <div class="pipeline-arrow"><i class="fa-solid fa-chevron-right"></i></div>
      <div class="pipeline-stage" data-nav="listings">
        <div class="pipeline-icon"><i class="fa-solid fa-building"></i></div>
        <div class="pipeline-label">Listings</div>
        <div class="pipeline-nums"><span class="pipeline-highlight">${lstActive}</span> in matching</div>
        <div class="pipeline-nums">${lstData.length} total &bull; ${lstLinked} program-linked</div>
      </div>
      <div class="pipeline-arrow"><i class="fa-solid fa-chevron-right"></i></div>
      <div class="pipeline-stage" data-nav="programs">
        <div class="pipeline-icon"><i class="fa-solid fa-globe"></i></div>
        <div class="pipeline-label">Programs</div>
        <div class="pipeline-nums"><span class="pipeline-highlight">${progAvail}</span> available</div>
        <div class="pipeline-nums">${progData.length} total &bull; ${progSoon} coming soon</div>
      </div>
    </div>
    <div class="dash-bottom">
      <div class="dash-stat-card" data-nav="interest-list">
        <div class="dash-stat-num">${ilData.length}</div>
        <div class="dash-stat-label">Interest List</div>
        <div class="dash-stat-sub">${ilCounts.new||0} new &bull; ${ilCounts.reviewing||0} reviewing &bull; ${ilCounts.active||0} active</div>
      </div>
      <div class="dash-stat-card" data-nav="interest-list">
        <div class="dash-stat-num">${ilCounts.matched||0}</div>
        <div class="dash-stat-label">Matched</div>
        <div class="dash-stat-sub">${ilCounts.expired||0} expired</div>
      </div>
    </div>`)

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.nav))
  })
}

// ─────────────────────────────────────────────────────────────
// PROPERTY SUBMISSIONS
// ─────────────────────────────────────────────────────────────
document.getElementById('ps-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  psFilter = btn.dataset.pf || 'all'
  renderPS()
})
document.getElementById('ps-add-btn').addEventListener('click', () => openPSModal(null))

async function loadPS() {
  setArea('ps-area', loading())
  const { data, error } = await sb.from('property_submissions').select('*').order('submitted_at', { ascending: false })
  if (error) { setArea('ps-area', errorState(error)); return }
  psData = data || []
  renderPS()
}

function renderPS() {
  const filterBtns = document.querySelectorAll('#ps-filter-bar .filter-btn')
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.pf === psFilter))

  let rows = psData
  if (psFilter === 'promoted') rows = psData.filter(r => (r.status||'new') === 'promoted')
  else if (psFilter === 'non-promoted') rows = psData.filter(r => (r.status||'new') !== 'promoted')
  if (!rows.length) { setArea('ps-area', emptyState('No submissions match this filter.')); return }

  rows = sortRows(rows, psSort)

  const psCols = [
    { label: 'Date',    col: 'submitted_at' },
    { label: 'Contact', col: 'contact_name' },
    { label: 'Address', col: 'prop_address' },
    { label: 'AMI',     col: 'ami_percent' },
    { label: 'Actions', col: null },
  ]

  const html = `<table class="data-table">
    <thead><tr>
      ${psCols.map(c => c.col
        ? `<th class="sortable${psSort.col === c.col ? ' sort-active' : ''}" data-sort-ps="${c.col}">${c.label} ${sortArrow(psSort, c.col)}</th>`
        : `<th>${c.label}</th>`
      ).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr class="clickable-row" onclick="openPSModal(${psData.indexOf(r)})">
        <td>${fmtDate(r.submitted_at)}</td>
        <td><strong>${esc(r.contact_name||'')}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.contact_email||'')}</span></td>
        <td>${esc(r.prop_address||'')}</td>
        <td>${esc(r.ami_percent ? r.ami_percent+'%' : '')}</td>
        <td onclick="event.stopPropagation()"><div class="action-cell">
          ${(r.status||'new') !== 'promoted'
            ? `<button class="btn-primary btn-xs" onclick="promoteToListing(${psData.indexOf(r)})"><i class="fa-solid fa-arrow-up-right-from-square"></i> Promote</button>`
            : `<span style="font-size:.75rem;color:#888;">Promoted</span>`}
        </div></td>
      </tr>`).join('')}
    </tbody>
  </table>`
  setArea('ps-area', html)
  document.querySelectorAll('[data-sort-ps]').forEach(th =>
    th.addEventListener('click', () => {
      const col = th.dataset.sortPs
      psSort = { col, asc: psSort.col === col ? !psSort.asc : true }
      renderPS()
    })
  )
}

function openPSModal(idx) {
  editingPsRow = idx !== null ? psData[idx] : null
  const p = editingPsRow || {}
  document.getElementById('ps-modal-title').textContent = editingPsRow ? 'Edit Submission' : 'Add Submission'
  document.getElementById('psf-name').value    = p.contact_name  || ''
  document.getElementById('psf-org').value     = p.contact_org   || ''
  document.getElementById('psf-email').value   = p.contact_email || ''
  document.getElementById('psf-phone').value   = p.contact_phone || ''
  document.getElementById('psf-address').value = p.prop_address  || ''
  document.getElementById('psf-count').value   = p.affordable_count || ''
  document.getElementById('psf-beds').value    = p.bedrooms      || ''
  document.getElementById('psf-baths').value   = p.bathrooms     || ''
  document.getElementById('psf-movein').value  = p.move_in_date  || ''
  document.getElementById('psf-ami').value     = p.ami_percent   || ''
  document.getElementById('psf-price').value   = p.affordable_price || ''
  document.getElementById('psf-hoa').value     = p.hoa_fee       || ''
  document.getElementById('psf-files').value   = p.file_links    || ''
  document.getElementById('ps-modal-overlay').classList.add('open')
}

document.getElementById('ps-cancel-btn').addEventListener('click', closePSModal)
document.getElementById('ps-modal-close').addEventListener('click', closePSModal)
function closePSModal() { document.getElementById('ps-modal-overlay').classList.remove('open'); editingPsRow = null }

document.getElementById('ps-save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('ps-save-btn')
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...'

  const row = {
    contact_name:    document.getElementById('psf-name').value.trim(),
    contact_org:     document.getElementById('psf-org').value.trim(),
    contact_email:   document.getElementById('psf-email').value.trim(),
    contact_phone:   document.getElementById('psf-phone').value.trim(),
    prop_address:    document.getElementById('psf-address').value.trim(),
    affordable_count: document.getElementById('psf-count').value.trim(),
    bedrooms:        document.getElementById('psf-beds').value.trim(),
    bathrooms:       document.getElementById('psf-baths').value.trim(),
    move_in_date:    document.getElementById('psf-movein').value,
    ami_percent:     document.getElementById('psf-ami').value.trim(),
    affordable_price: document.getElementById('psf-price').value.trim(),
    hoa_fee:         document.getElementById('psf-hoa').value.trim(),
    file_links:      document.getElementById('psf-files').value.trim(),
  }

  let error
  if (editingPsRow?.id) {
    ;({ error } = await sb.from('property_submissions').update(row).eq('id', editingPsRow.id))
  } else {
    ;({ error } = await sb.from('property_submissions').insert({ ...row, status: 'new' }))
  }

  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Submission'
  if (error) { toast(error.message, true); return }
  toast(editingPsRow ? 'Submission updated.' : 'Submission added.')
  closePSModal()
  psData = []
  loadPS()
})

async function promoteToListing(idx) {
  const r = psData[idx]
  promotingPsId = r.id
  // Pre-fill listing modal from PS data
  openLSTModal(null, {
    listing_id:   '',
    listing_name: r.prop_address || '',
    active:       'NO',
    ami_percent:  r.ami_percent || '',
    bedrooms:     r.bedrooms || '',
    bathrooms:    r.bathrooms || '',
    address:      r.prop_address || '',
    city:         '',
    price:        r.affordable_price || '',
    program_notes: '',
    internal_notes: '',
    listing_type: 'affordable',
    source_submission_row: r.id,
  })
}

// ─────────────────────────────────────────────────────────────
// LISTINGS
// ─────────────────────────────────────────────────────────────
document.getElementById('lst-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  lstFilter = btn.dataset.lf || 'active'
  renderListings()
})
document.getElementById('lst-add-btn').addEventListener('click', () => openLSTModal(null))
document.getElementById('lst-cancel-btn').addEventListener('click', closeLSTModal)
document.getElementById('lst-modal-close').addEventListener('click', closeLSTModal)

async function loadListings() {
  setArea('lst-area', loading())
  try {
    const fetches = [sb.from('listings').select('*').order('created_at', { ascending: false })]
    if (!progData.length) fetches.push(sb.from('programs').select('*').order('created_at', { ascending: false }))
    const [lstRes, progRes] = await Promise.all(fetches)
    if (lstRes.error) { setArea('lst-area', errorState(lstRes.error)); return }
    lstData = lstRes.data || []
    if (progRes && !progRes.error) progData = progRes.data || []
    renderListings()
  } catch (err) {
    setArea('lst-area', errorState(err))
  }
}

function renderListings() {
  document.querySelectorAll('#lst-filter-bar .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lf === lstFilter))

  let rows = lstData
  if (lstFilter === 'active')   rows = lstData.filter(r => r.active === 'YES')
  if (lstFilter === 'inactive') rows = lstData.filter(r => r.active !== 'YES')
  if (lstFilter === 'on-site')  rows = lstData.filter(r => r.linked_program_id)

  if (!rows.length) { setArea('lst-area', emptyState('No listings match this filter.')); return }

  const html = `<div class="prog-grid">
    ${rows.map(r => {
      const idx = lstData.indexOf(r)
      const progBadge = r.linked_program_id
        ? `<span class="prog-badge"><i class="fa-solid fa-globe"></i> ${esc(r.linked_program_id)}</span>`
        : ''
      return `<div class="prog-card ${r.active === 'YES' ? 'prog-card--available' : 'prog-card--inactive'}">
        <div class="prog-card-header">
          <div style="min-width:0;flex:1;">
            <div class="prog-card-name">${esc(r.listing_name || r.listing_id)}</div>
            <div class="prog-card-area"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.75rem;margin-right:.3rem;"></i>${esc(r.city || r.address || '')}</div>
          </div>
          <span class="status-pill ${r.active === 'YES' ? 'pill-active' : 'pill-expired'}" style="flex-shrink:0;">${r.active === 'YES' ? 'In Matching' : 'Not Matching'}</span>
        </div>
        <div class="prog-card-body">
          ${r.ami_percent ? `<div class="prog-detail"><span class="prog-detail-label">AMI</span><span class="prog-detail-value">${esc(r.ami_percent)}%</span></div>` : ''}
          ${r.price ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-tag" style="width:14px;color:#888;margin-right:.3rem;"></i>Price</span><span class="prog-detail-value">$${esc(r.price)}</span></div>` : ''}
          ${r.bedrooms ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-bed" style="width:14px;color:#888;margin-right:.3rem;"></i>Beds</span><span class="prog-detail-value">${esc(r.bedrooms)}</span></div>` : ''}
          ${r.internal_notes ? `<div class="lst-card-notes"><i class="fa-solid fa-note-sticky"></i> ${esc(r.internal_notes)}</div>` : ''}
          ${progBadge}
        </div>
        <div class="prog-card-footer">
          <button class="btn-secondary btn-sm" onclick="openLSTModal(${idx})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteListing(${idx})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  </div>`
  setArea('lst-area', html)
}

// ── Listing Modal ─────────────────────────────────────────────
function openLSTModal(idx, prefill) {
  editingLstRow = idx !== null && idx !== undefined ? lstData[idx] : null
  const p = editingLstRow || prefill || {}
  document.getElementById('lst-modal-title').textContent = editingLstRow ? 'Edit Listing' : (promotingPsId ? 'Promote to Listing' : 'Add Listing')
  document.getElementById('lf-id').value          = p.listing_id || ''
  document.getElementById('lf-name').value        = p.listing_name || ''
  document.getElementById('lf-active').checked     = (p.active || 'YES') === 'YES'
  document.getElementById('lf-units').value       = p.units_available ?? ''
  document.getElementById('lf-type').value        = p.listing_type || 'affordable'
  document.getElementById('lf-address').value     = p.address || ''
  document.getElementById('lf-city').value        = p.city || ''
  document.getElementById('lf-price').value       = p.price || ''
  document.getElementById('lf-beds').value        = p.bedrooms || ''
  document.getElementById('lf-baths').value       = p.bathrooms || ''
  document.getElementById('lf-sqft').value        = p.sqft || ''
  document.getElementById('lf-program-type').value = p.program_type || ''
  document.getElementById('lf-ami').value         = p.ami_percent || ''
  document.getElementById('lf-credit').value      = p.min_credit_score || ''
  document.getElementById('lf-dti').value         = p.max_dti_percent || ''
  document.getElementById('lf-debt').value        = p.max_monthly_debt || ''
  document.getElementById('lf-minhh').value       = p.min_household_size || ''
  document.getElementById('lf-maxhh').value       = p.max_household_size || ''
  document.getElementById('lf-ftb').value         = p.first_time_buyer_required || ''
  document.getElementById('lf-inc1').value        = p.max_income_1person || ''
  document.getElementById('lf-inc4').value        = p.max_income_4person || ''
  document.getElementById('lf-inc6').value        = p.max_income_6person || ''
  document.getElementById('lf-sdres').value       = p.sd_county_residency_required || 'YES'
  document.getElementById('lf-prog-notes').value  = p.program_notes || ''
  document.getElementById('lf-int-notes').value   = p.internal_notes || ''
  document.getElementById('lf-src-row').value     = p.source_submission_row || ''
  document.getElementById('lf-sdmonths').value      = p.sd_residency_months || ''
  document.getElementById('lf-hhtogether').value    = p.household_together_months || ''
  document.getElementById('lf-ftb-years').value     = p.no_ownership_years || ''
  document.getElementById('lf-inc2').value          = p.max_income_2person || ''
  document.getElementById('lf-inc3').value          = p.max_income_3person || ''
  document.getElementById('lf-inc5').value          = p.max_income_5person || ''
  document.getElementById('lf-mininc').value        = p.min_income || ''
  document.getElementById('lf-minassets').value     = p.min_assets || ''
  document.getElementById('lf-maxassets').value     = p.max_assets || ''
  document.getElementById('lf-mindown').value       = p.min_down_payment_pct || ''
  document.getElementById('lf-maxdown').value       = p.max_down_payment_pct || ''
  document.getElementById('lf-minempmo').value      = p.min_employment_months || ''
  document.getElementById('lf-sdhc').value          = p.sdhc_prior_purchase_allowed || ''
  document.getElementById('lf-foreclosure').value   = p.foreclosure_allowed || ''
  document.getElementById('lf-fcyears').value       = p.foreclosure_min_years || ''
  document.getElementById('lf-bankruptcy').value    = p.bankruptcy_allowed || ''
  document.getElementById('lf-bkyears').value       = p.bankruptcy_min_years || ''
  document.getElementById('lf-judgments').value     = p.judgments_allowed || ''
  document.getElementById('lf-citizenship').value   = p.citizenship_required || ''
  document.getElementById('lf-permresident').value  = p.permanent_resident_acceptable || ''

  // Populate site program dropdown from cached progData
  const progSel = document.getElementById('lf-linked-prog')
  progSel.innerHTML = '<option value="">-- No program linked --</option>'
    + progData.map(pr =>
        `<option value="${esc(pr.community_name || '')}">${esc(pr.community_name || 'Unnamed Program')}</option>`
      ).join('')
  progSel.value = p.linked_program_id || ''

  // Wire "New Program" button — pre-fills the program form from this listing's data
  document.getElementById('lf-new-prog-btn').onclick = () => {
    closeLSTModal()
    switchTab('programs')
    openProgModal(null, {
      community_name: p.listing_name || p.listing_id || '',
      area:           p.city || '',
      program_type:   p.program_type || '',
      ami_range:      p.ami_percent ? p.ami_percent + '% AMI' : '',
      bedrooms:       p.bedrooms || '',
      household_size_limit: p.max_household_size
        ? (p.min_household_size && p.min_household_size !== p.max_household_size
            ? `${p.min_household_size}-${p.max_household_size}`
            : p.max_household_size)
        : '',
      first_time_buyer: p.first_time_buyer_required === 'YES' ? 'Required'
        : p.first_time_buyer_required === 'NO' ? 'Not Required' : '',
      price_range:    p.price || '',
      status:         'Available',
      notes:          p.program_notes || '',
      source_listing_id: p.listing_id || '',
    })
  }

  document.getElementById('lst-modal-overlay').classList.add('open')
}

function closeLSTModal() {
  document.getElementById('lst-modal-overlay').classList.remove('open')
  editingLstRow = null
  promotingPsId = null
}

document.getElementById('lst-save-btn').addEventListener('click', async () => {
  const id = document.getElementById('lf-id').value.trim()
  if (!id) { toast('Property ID is required.', true); return }

  const btn = document.getElementById('lst-save-btn')
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...'

  const listing = {
    listing_id:   id,
    listing_name: document.getElementById('lf-name').value.trim() || id,
    active:       document.getElementById('lf-active').checked ? 'YES' : 'NO',
    units_available: document.getElementById('lf-units').value !== '' ? parseInt(document.getElementById('lf-units').value) : null,
    listing_type: document.getElementById('lf-type').value,
    address:      document.getElementById('lf-address').value.trim(),
    city:         document.getElementById('lf-city').value.trim(),
    price:        document.getElementById('lf-price').value.trim(),
    bedrooms:     document.getElementById('lf-beds').value.trim(),
    bathrooms:    document.getElementById('lf-baths').value.trim(),
    sqft:         document.getElementById('lf-sqft').value.trim(),
    program_type: document.getElementById('lf-program-type').value.trim(),
    ami_percent:  document.getElementById('lf-ami').value.trim(),
    min_credit_score:    document.getElementById('lf-credit').value.trim(),
    max_dti_percent:     document.getElementById('lf-dti').value.trim(),
    max_monthly_debt:    document.getElementById('lf-debt').value.trim(),
    min_household_size:  document.getElementById('lf-minhh').value.trim(),
    max_household_size:  document.getElementById('lf-maxhh').value.trim(),
    first_time_buyer_required: document.getElementById('lf-ftb').value,
    max_income_1person:  document.getElementById('lf-inc1').value.trim(),
    max_income_4person:  document.getElementById('lf-inc4').value.trim(),
    max_income_6person:  document.getElementById('lf-inc6').value.trim(),
    sd_county_residency_required: document.getElementById('lf-sdres').value,
    program_notes:  document.getElementById('lf-prog-notes').value.trim(),
    internal_notes: document.getElementById('lf-int-notes').value.trim(),
    source_submission_row: document.getElementById('lf-src-row').value || null,
    linked_program_id:     document.getElementById('lf-linked-prog').value || null,
    sd_residency_months:        document.getElementById('lf-sdmonths').value.trim() || null,
    household_together_months:  document.getElementById('lf-hhtogether').value.trim() || null,
    no_ownership_years:         document.getElementById('lf-ftb-years').value.trim() || null,
    max_income_2person:         document.getElementById('lf-inc2').value.trim() || null,
    max_income_3person:         document.getElementById('lf-inc3').value.trim() || null,
    max_income_5person:         document.getElementById('lf-inc5').value.trim() || null,
    min_income:                 document.getElementById('lf-mininc').value.trim() || null,
    min_assets:                 document.getElementById('lf-minassets').value.trim() || null,
    max_assets:                 document.getElementById('lf-maxassets').value.trim() || null,
    min_down_payment_pct:       document.getElementById('lf-mindown').value.trim() || null,
    max_down_payment_pct:       document.getElementById('lf-maxdown').value.trim() || null,
    min_employment_months:      document.getElementById('lf-minempmo').value.trim() || null,
    sdhc_prior_purchase_allowed: document.getElementById('lf-sdhc').value || null,
    foreclosure_allowed:        document.getElementById('lf-foreclosure').value || null,
    foreclosure_min_years:      document.getElementById('lf-fcyears').value.trim() || null,
    bankruptcy_allowed:         document.getElementById('lf-bankruptcy').value || null,
    bankruptcy_min_years:       document.getElementById('lf-bkyears').value.trim() || null,
    judgments_allowed:          document.getElementById('lf-judgments').value || null,
    citizenship_required:       document.getElementById('lf-citizenship').value || null,
    permanent_resident_acceptable: document.getElementById('lf-permresident').value || null,
    updated_at: new Date().toISOString(),
  }

  let error
  if (editingLstRow?.id) {
    ;({ error } = await sb.from('listings').update(listing).eq('id', editingLstRow.id))
  } else {
    ;({ error } = await sb.from('listings').insert(listing))
  }

  // If promoted from PS, update the PS row status
  if (!error && promotingPsId) {
    await sb.from('property_submissions')
      .update({ status: 'promoted', promoted_to: id })
      .eq('id', promotingPsId)
    psData = []
  }

  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Listing'
  if (error) { toast(error.message, true); return }
  toast(promotingPsId ? 'Promoted to listing!' : editingLstRow ? 'Listing updated.' : 'Listing added.')
  closeLSTModal()
  lstData = []
  loadListings()
})

async function deleteListing(idx) {
  const r = lstData[idx]
  if (!confirm(`Delete listing "${r.listing_name || r.listing_id}"? This cannot be undone.`)) return
  const { error } = await sb.from('listings').delete().eq('id', r.id)
  if (error) { toast(error.message, true); return }
  toast('Listing deleted.')
  lstData = []
  loadListings()
}

// ─────────────────────────────────────────────────────────────
// PROGRAMS
// ─────────────────────────────────────────────────────────────
document.getElementById('prog-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  progFilter = btn.dataset.prgf || 'active'
  renderPrograms()
})
document.getElementById('prog-add-btn').addEventListener('click', () => openProgModal(null))
document.getElementById('prog-cancel-btn').addEventListener('click', closeProgModal)
document.getElementById('prog-modal-close').addEventListener('click', closeProgModal)

async function loadPrograms() {
  setArea('prog-area', loading())
  try {
    const fetches = [sb.from('programs').select('*').order('created_at', { ascending: false })]
    if (!lstData.length) fetches.push(sb.from('listings').select('*').order('created_at', { ascending: false }))
    const [progRes, lstRes] = await Promise.all(fetches)
    if (progRes.error) { setArea('prog-area', errorState(progRes.error)); return }
    progData = progRes.data || []
    if (lstRes && !lstRes.error) lstData = lstRes.data || []
    renderPrograms()
  } catch (err) {
    setArea('prog-area', errorState(err))
  }
}

async function loadListingsQuiet() {
  const { data } = await sb.from('listings').select('*').order('created_at', { ascending: false })
  lstData = data || []
}

function renderPrograms() {
  document.querySelectorAll('#prog-filter-bar .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.prgf === progFilter))

  let rows = progData
  if (progFilter === 'active')   rows = progData.filter(r => r.status === 'Available' || r.status === 'Coming Soon')
  if (progFilter === 'inactive') rows = progData.filter(r => r.status === 'Inactive')

  if (!rows.length) { setArea('prog-area', emptyState('No communities match this filter.')); return }

  // Build prog -> linked listings map from lstData
  const progToListings = {}
  lstData.forEach(l => {
    if (l.linked_program_id) {
      if (!progToListings[l.linked_program_id]) progToListings[l.linked_program_id] = []
      progToListings[l.linked_program_id].push(l.listing_name || l.listing_id || 'Listing')
    }
  })

  const html = `<div class="prog-grid">
    ${rows.map(p => {
      const idx = progData.indexOf(p)
      const s = (p.status || '').toLowerCase()
      const bgCls = s === 'available' ? 'prog-card--available' : s === 'coming soon' ? 'prog-card--soon' : 'prog-card--inactive'
      const badgeCls = s === 'available' ? 'pill-active' : s === 'coming soon' ? 'pill-reviewing' : 'pill-expired'
      const lnkLst = progToListings[p.community_name] || []
      return `<div class="prog-card ${bgCls}">
        <div class="prog-card-header">
          <div style="min-width:0;flex:1;">
            <div class="prog-card-name">${esc(p.community_name || 'Unnamed')}</div>
            <div class="prog-card-area"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.75rem;margin-right:.3rem;"></i>${esc(p.area || '')}</div>
          </div>
          <span class="status-pill ${badgeCls}" style="flex-shrink:0;">${esc(p.status || '')}</span>
        </div>
        <div class="prog-card-body">
          ${p.program_type ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-building" style="width:14px;color:#888;margin-right:.3rem;"></i>Program Type</span><span class="prog-detail-value">${esc(p.program_type)}</span></div>` : ''}
          ${p.ami_range ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-chart-bar" style="width:14px;color:#888;margin-right:.3rem;"></i>AMI Range</span><span class="prog-detail-value">${esc(p.ami_range)}</span></div>` : ''}
          ${p.bedrooms ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-bed" style="width:14px;color:#888;margin-right:.3rem;"></i>Bedrooms</span><span class="prog-detail-value">${esc(p.bedrooms)}</span></div>` : ''}
          ${p.price_range ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-tag" style="width:14px;color:#888;margin-right:.3rem;"></i>Price Range</span><span class="prog-detail-value">${esc(p.price_range)}</span></div>` : ''}
          ${p.notes ? `<div style="font-size:.78rem;color:#888;background:rgba(0,0,0,.04);border-radius:6px;padding:.45rem .6rem;margin-top:.2rem;">${esc(p.notes)}</div>` : ''}
          ${lnkLst.length
            ? `<div class="prog-link-note"><i class="fa-solid fa-link"></i> ${lnkLst.length} linked listing${lnkLst.length === 1 ? '' : 's'}: ${esc(lnkLst.join(', '))}</div>`
            : `<div class="prog-link-note" style="color:#bbb;"><i class="fa-solid fa-unlink"></i> No linked listings</div>`}
        </div>
        <div class="prog-card-footer">
          <button class="btn-secondary btn-sm" onclick="openProgModal(${idx})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteProg(${idx})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  </div>`
  setArea('prog-area', html)
}

function openProgModal(idx, prefill) {
  editingProgRow = idx !== null && idx !== undefined ? progData[idx] : null
  const p = editingProgRow || prefill || {}
  document.getElementById('prog-modal-title').textContent = editingProgRow ? 'Edit Community' : (prefill ? 'Push to Site' : 'Add Community')
  document.getElementById('pf-name').value   = p.community_name  || ''
  document.getElementById('pf-area').value   = p.area            || ''
  document.getElementById('pf-type').value   = p.program_type    || ''
  document.getElementById('pf-ami').value    = p.ami_range       || ''
  document.getElementById('pf-beds').value   = p.bedrooms        || ''
  document.getElementById('pf-hh').value     = p.household_size_limit || ''
  document.getElementById('pf-ftb').value    = p.first_time_buyer || ''
  document.getElementById('pf-price').value  = p.price_range     || ''
  document.getElementById('pf-status').value = p.status          || 'Available'
  document.getElementById('pf-notes').value  = p.notes           || ''
  document.getElementById('pf-src-listing').value = p.source_listing_id || ''

  // Build linked listings list from lstData
  const progName = p.community_name || ''
  const lnkLst = lstData.filter(l => l.linked_program_id === progName)
  const labelEl = document.getElementById('pf-linked-listings-label')
  if (lnkLst.length) {
    labelEl.innerHTML = `<strong style="font-size:.8rem;color:#555;">Linked listings:</strong>
      <ul style="margin:.3rem 0 0 1.1rem;padding:0;font-size:.78rem;color:#444;">
        ${lnkLst.map(l => `<li style="margin-bottom:.15rem;">${esc(l.listing_name || l.listing_id)}</li>`).join('')}
      </ul>`
  } else {
    labelEl.innerHTML = editingProgRow ? '<span style="font-size:.78rem;color:#bbb;">No linked listings</span>' : ''
  }

  document.getElementById('prog-modal-overlay').classList.add('open')
}

function closeProgModal() {
  document.getElementById('prog-modal-overlay').classList.remove('open')
  editingProgRow = null
}

document.getElementById('prog-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('pf-name').value.trim()
  const area = document.getElementById('pf-area').value.trim()
  if (!name || !area) { toast('Community Name and Area are required.', true); return }

  const btn = document.getElementById('prog-save-btn')
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...'

  const prog = {
    community_name:       name,
    area,
    program_type:         document.getElementById('pf-type').value.trim(),
    ami_range:            document.getElementById('pf-ami').value.trim(),
    bedrooms:             document.getElementById('pf-beds').value.trim(),
    household_size_limit: document.getElementById('pf-hh').value.trim(),
    first_time_buyer:     document.getElementById('pf-ftb').value.trim(),
    price_range:          document.getElementById('pf-price').value.trim(),
    status:               document.getElementById('pf-status').value,
    notes:                document.getElementById('pf-notes').value.trim(),
    source_listing_id:    document.getElementById('pf-src-listing').value.trim() || null,
    updated_at:           new Date().toISOString(),
  }

  let error
  if (editingProgRow?.id) {
    ;({ error } = await sb.from('programs').update(prog).eq('id', editingProgRow.id))
  } else {
    ;({ error } = await sb.from('programs').insert(prog))
  }

  // If created from a listing, also update that listing's linked_program_id
  if (!error && prog.source_listing_id) {
    await sb.from('listings').update({ linked_program_id: name }).eq('listing_id', prog.source_listing_id)
    lstData = []
  }

  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Community'
  if (error) { toast(error.message, true); return }
  toast(editingProgRow ? 'Community updated.' : 'Community added.')
  closeProgModal()
  progData = []; lstData = []
  await loadPrograms()
  if (!lstData.length) await loadListingsQuiet()
})

async function deleteProg(idx) {
  const p = progData[idx]
  if (!confirm(`Delete "${p.community_name}"? This cannot be undone.`)) return
  const { error } = await sb.from('programs').delete().eq('id', p.id)
  if (error) { toast(error.message, true); return }
  toast('Community deleted.')
  progData = []
  loadPrograms()
}

// ─────────────────────────────────────────────────────────────
// INTEREST LIST
// ─────────────────────────────────────────────────────────────
document.getElementById('il-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  ilFilter = btn.dataset.ilf || 'all'
  renderIL()
})
document.getElementById('il-search').addEventListener('input', e => {
  ilSearch = e.target.value.toLowerCase()
  renderIL()
})
document.getElementById('il-modal-close').addEventListener('click',  closeILModal)
document.getElementById('il-modal-close2').addEventListener('click', closeILModal)

async function loadInterestList() {
  setArea('il-area', loading())
  const { data, error } = await sb.from('interest_list').select('*').order('submitted_at', { ascending: false })
  if (error) { setArea('il-area', errorState(error)); return }
  ilData = data || []
  renderIL()
}

function renderIL() {
  document.querySelectorAll('#il-filter-bar .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.ilf === ilFilter))

  let rows = ilData
  if (ilFilter !== 'all') rows = ilData.filter(r => r.status === ilFilter)
  if (ilSearch) rows = rows.filter(r =>
    (r.full_name || '').toLowerCase().includes(ilSearch) ||
    (r.email     || '').toLowerCase().includes(ilSearch))

  if (!rows.length) { setArea('il-area', emptyState('No applicants match.')); return }

  rows = sortRows(rows, ilSort)

  const ilCols = [
    { label: 'Name',           col: 'full_name' },
    { label: 'Email',          col: 'email' },
    { label: 'Phone',          col: 'phone' },
    { label: 'Submitted',      col: 'submitted_at' },
    { label: 'Status',         col: 'status' },
    { label: 'Area Preference',col: 'area_preference' },
  ]

  const html = `<table class="data-table">
    <thead><tr>
      ${ilCols.map(c =>
        `<th class="sortable${ilSort.col === c.col ? ' sort-active' : ''}" data-sort-il="${c.col}">${c.label} ${sortArrow(ilSort, c.col)}</th>`
      ).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr class="clickable-row" onclick="openILModal(${ilData.indexOf(r)})">
        <td><strong>${esc(r.full_name || '')}</strong></td>
        <td>${esc(r.email || '')}</td>
        <td>${esc(r.phone || '')}</td>
        <td>${fmtDate(r.submitted_at)}</td>
        <td><span class="status-pill ${ilPillCls(r.status)}">${esc(r.status || '')}</span></td>
        <td style="font-size:.78rem;color:#666;max-width:200px;white-space:normal;">${esc((r.area_preference || '').substring(0, 80))}</td>
      </tr>`).join('')}
    </tbody>
  </table>`
  setArea('il-area', html)
  document.querySelectorAll('[data-sort-il]').forEach(th =>
    th.addEventListener('click', () => {
      const col = th.dataset.sortIl
      ilSort = { col, asc: ilSort.col === col ? !ilSort.asc : true }
      renderIL()
    })
  )
}

function ilSection(title, pairs) {
  const rows = pairs.filter(([, v]) => v != null && v !== '').map(([l, v]) =>
    `<div class="field-row"><span class="field-label">${esc(l)}</span><span class="field-value">${esc(String(v))}</span></div>`
  ).join('')
  if (!rows) return ''
  return `<div class="field-group il-section"><div class="field-group-title">${title}</div>${rows}</div>`
}

function openILModal(idx) {
  viewingIlRow = ilData[idx]
  const r = viewingIlRow
  document.getElementById('il-modal-title').textContent = r.full_name || r.email

  // ── Contact Info ──────────────────────────────────────────
  const contactSection = ilSection('Contact Info', [
    ['Email',          r.email],
    ['Phone',          r.phone],
    ['Submitted',      fmtDate(r.submitted_at)],
    ['Updated',        r.updated_at && r.updated_at !== r.submitted_at ? fmtDate(r.updated_at) : null],
    ['Original Signup',r.original_signup_at && r.original_signup_at !== r.submitted_at ? fmtDate(r.original_signup_at) : null],
    ['Area Preference',r.area_preference],
  ])

  // ── Household & Eligibility ───────────────────────────────
  const householdSection = ilSection('Household & Eligibility', [
    ['Household Size',        r.household_size],
    ['Lived Together 12mo',   r.lived_together_12mo],
    ['SD County Resident',    r.live_in_sd_county],
    ['SD 2yr Residency/Work', r.worked_lived_sd_2yr],
    ['SDHC Prior Purchase',   r.sdhc_prior_purchase],
    ['Owned Real Estate',     r.owned_real_estate],
  ])

  // ── Financial ─────────────────────────────────────────────
  const financialSection = ilSection('Financial', [
    ['Credit Score (Self)',      r.credit_score_self],
    ['Credit Score (Co-borrower)', r.credit_score_coborrower],
    ['Monthly Rent',             r.monthly_rent ? '$' + r.monthly_rent : null],
    ['Rent Subsidized',          r.rent_subsidized],
    ['Rent Subsidy Amount',      r.rent_subsidy_amount ? '$' + r.rent_subsidy_amount : null],
    ['Monthly Debt Payments',    r.monthly_debt_payments ? '$' + r.monthly_debt_payments : null],
  ])

  // ── Disclosures ───────────────────────────────────────────
  const disclosuresSection = ilSection('Disclosures', [
    ['US Citizen',               r.us_citizen],
    ['Permanent Resident',       r.permanent_resident],
    ['Foreclosure / Short Sale', r.foreclosure],
    ['Foreclosure Date',         r.foreclosure_date],
    ['Bankruptcy',               r.bankruptcy],
    ['Bankruptcy Discharge Date',r.bankruptcy_discharge_date],
    ['Judgments / Liens',        r.judgments],
    ['Judgments Detail',         r.judgments_description],
  ])

  // ── Assets ────────────────────────────────────────────────
  const assetsSection = ilSection('Assets', [
    ['Checking', r.asset_checking ? '$' + r.asset_checking : null],
    ['Savings',  r.asset_savings  ? '$' + r.asset_savings  : null],
    ['401k',     r.asset_401k     ? '$' + r.asset_401k     : null],
    ['Other',    r.asset_other    ? '$' + r.asset_other     : null],
  ])

  // ── Income Members ────────────────────────────────────────
  const incomeRows = [1,2,3,4,5,6].map(n => {
    const nm  = r[`income_${n}_name`]
    const amt = r[`income_${n}_annual`]
    if (!nm && !amt) return ''
    return `<tr>
      <td style="padding:5px 8px;">${esc(nm || '')}</td>
      <td style="padding:5px 8px;">${esc(r[`income_${n}_relationship`] || '')}</td>
      <td style="padding:5px 8px;">${amt ? '$' + esc(String(amt)) : ''}</td>
    </tr>`
  }).filter(Boolean).join('')
  const incomeSection = incomeRows ? `
    <div class="field-group il-section">
      <div class="field-group-title">Income Members</div>
      <table style="font-size:.82rem;width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f5f5f0;">
          <th style="padding:5px 8px;text-align:left;">Name</th>
          <th style="padding:5px 8px;text-align:left;">Relationship</th>
          <th style="padding:5px 8px;text-align:left;">Annual Income</th>
        </tr></thead>
        <tbody>${incomeRows}</tbody>
      </table>
    </div>` : ''

  // ── Tax-Year Income ───────────────────────────────────────
  const taxYears = [r.tax_year_labels, r.tax_1_total, r.tax_2_total, r.tax_3_total].some(Boolean)
  const taxSection = taxYears ? (() => {
    const labels = (r.tax_year_labels || '').split(',').map(s => s.trim())
    const years = [1,2,3].map(n => {
      const total  = r[`tax_${n}_total`]
      const schedC = r[`tax_${n}_sched_c`]
      if (!total && !schedC) return ''
      const yr = labels[n-1] || `Year ${n}`
      return `<div class="field-row"><span class="field-label">${esc(yr)}</span>` +
        `<span class="field-value">${total ? '$' + esc(String(total)) : ''}${schedC ? ` (Sched C: $${esc(String(schedC))})` : ''}</span></div>`
    }).filter(Boolean).join('')
    return years ? `<div class="field-group il-section"><div class="field-group-title">Tax-Year Income</div>${years}</div>` : ''
  })() : ''

  // ── Non-Taxable Income ────────────────────────────────────
  const nontaxBlocks = [1,2,3].map(n => {
    const who    = r[`nontax_${n}_who`]
    const source = r[`nontax_${n}_source`]
    const amt    = r[`nontax_${n}_amount`]
    if (!who && !source && !amt) return ''
    const endNote = r[`nontax_${n}_end_date_yn`] === 'Yes' ? ` (ends ${r[`nontax_${n}_end_date`] || 'TBD'})` : ''
    return `<div class="field-row">` +
      `<span class="field-label">${esc(who || 'Member ' + n)}</span>` +
      `<span class="field-value">${esc(source || '')}${amt ? ' — $' + esc(String(amt)) : ''}${endNote}</span></div>`
  }).filter(Boolean).join('')
  const nontaxHeader = r.non_taxable_income ? `<div class="field-row"><span class="field-label">Has Non-Taxable Income</span><span class="field-value">${esc(r.non_taxable_income)}</span></div>` : ''
  const nontaxSection = (nontaxHeader || nontaxBlocks)
    ? `<div class="field-group il-section"><div class="field-group-title">Non-Taxable Income</div>${nontaxHeader}${nontaxBlocks}</div>`
    : ''

  // ── Real Estate Agent ─────────────────────────────────────
  const agentSection = ilSection('Real Estate Agent', [
    ['Working with Agent', r.agent_yn],
    ['Agent Name',         r.agent_name],
    ['Agent Email',        r.agent_email],
    ['Agent Phone',        r.agent_phone],
    ['Agent DRE #',        r.agent_dre],
  ])

  // ── Household Details ─────────────────────────────────────
  const householdDetails = ilSection('Household Details', [
    ['Loan Signers',      r.loan_signers],
    ['Household Members', r.household_members],
  ])

  // ── Employment ────────────────────────────────────────────
  function empRow(label, val) {
    if (!val) return ''
    return `<div class="field-row"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(String(val))}</span></div>`
  }
  const empBlocks = [1,2,3,4].map(n => {
    const name     = r[`emp_${n}_name`]
    const employer = r[`emp_${n}_employer`]
    if (!name && !employer) return ''
    const salary   = r[`emp_${n}_annual_salary`] ? '$' + r[`emp_${n}_annual_salary`] : null
    const hourly   = r[`emp_${n}_hourly_rate`]   ? '$' + r[`emp_${n}_hourly_rate`]   : null
    const ytd      = r[`emp_${n}_ytd_gross`]     ? '$' + r[`emp_${n}_ytd_gross`]     : null
    const breaks   = r[`emp_${n}_breaks`] === 'Yes'
      ? (r[`emp_${n}_breaks_desc`] ? `Yes — ${r[`emp_${n}_breaks_desc`]}` : 'Yes')
      : r[`emp_${n}_breaks`]
    return `<div style="border-bottom:1px solid var(--border);padding:.5rem 0 .25rem;">
      <div style="padding:.25rem .75rem;font-weight:600;font-size:.82rem;">${esc(name || employer || 'Member ' + n)}</div>
      ${empRow('Relationship',      r[`emp_${n}_relationship`])}
      ${empRow('Employer',          employer)}
      ${empRow('Employment Status', r[`emp_${n}_status`])}
      ${empRow('Same Employer Line',r[`emp_${n}_same_line`])}
      ${empRow('Income Type',       r[`emp_${n}_income_type`])}
      ${empRow('Annual Salary',     salary)}
      ${empRow('Hourly Rate',       hourly)}
      ${empRow('Hours / Week',      r[`emp_${n}_hours_per_week`])}
      ${empRow('YTD Gross',         ytd)}
      ${empRow('Recent W-2',        r[`emp_${n}_w2_recent`])}
      ${empRow('Start Date',        r[`emp_${n}_start_date`])}
      ${empRow('End Date',          r[`emp_${n}_end_date`])}
      ${empRow('Employment Breaks', breaks)}
      ${empRow('Pay Period End',    r[`emp_${n}_pay_period_end`])}
    </div>`
  }).filter(Boolean).join('')
  const empSection = empBlocks ? `
    <div class="field-group il-section">
      <div class="field-group-title">Employment</div>
      ${empBlocks}
    </div>` : ''

  // ── Additional Info ───────────────────────────────────────
  const additionalSection = r.additional_info
    ? `<div class="field-group il-section"><div class="field-group-title">Additional Info / Notes</div>
       <div style="padding:.6rem .75rem;font-size:.85rem;white-space:pre-wrap;line-height:1.5;">${esc(r.additional_info)}</div></div>`
    : ''

  const statusSection = `
    <div class="il-status-bar">
      <label for="il-status-select" class="il-status-label">Status</label>
      <div class="il-status-controls">
        <select id="il-status-select" class="form-input" style="width:auto;display:inline-block;">
          <option value="new">new</option>
          <option value="reviewing">reviewing</option>
          <option value="active">active</option>
          <option value="matched">matched</option>
          <option value="expired">expired</option>
        </select>
        <button class="btn-primary btn-sm" id="il-status-save-btn">
          <i class="fa-solid fa-check"></i> Save Status
        </button>
      </div>
    </div>`

  document.getElementById('il-modal-body').innerHTML =
    statusSection + contactSection + householdSection + householdDetails +
    financialSection + assetsSection + disclosuresSection + agentSection +
    incomeSection + taxSection + nontaxSection +
    empSection + additionalSection

  document.getElementById('il-status-select').value = r.status || 'new'

  document.getElementById('il-status-save-btn').addEventListener('click', async () => {
    if (!viewingIlRow) return
    const newStatus = document.getElementById('il-status-select').value
    const { error } = await sb.from('interest_list')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', viewingIlRow.id)
    if (error) { toast(error.message, true); return }
    viewingIlRow.status = newStatus
    toast('Status updated.')
    ilData = []
    await loadInterestList()
  })

  document.getElementById('il-delete-btn').addEventListener('click', async () => {
    if (!viewingIlRow) return
    if (!confirm(`Permanently delete ${viewingIlRow.full_name || viewingIlRow.email} from the Interest List?\n\nThis will also remove all their match results. This cannot be undone.`)) return
    const { error } = await sb.from('interest_list').delete().eq('id', viewingIlRow.id)
    if (error) { toast(error.message, true); return }
    await sb.from('match_results').delete().eq('email', viewingIlRow.email)
    toast('Applicant deleted.')
    closeILModal()
    ilData = []
    loadInterestList()
  })

  document.getElementById('il-modal-overlay').classList.add('open')
}

function closeILModal() {
  document.getElementById('il-modal-overlay').classList.remove('open')
  viewingIlRow = null
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    let av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
    // Date strings sort correctly as strings; numbers too if we coerce
    const an = Number(av), bn = Number(bv)
    if (!isNaN(an) && !isNaN(bn)) { av = an; bv = bn }
    else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase() }
    if (av < bv) return sort.asc ? -1 : 1
    if (av > bv) return sort.asc ? 1 : -1
    return 0
  })
}

function sortArrow(sort, col) {
  if (sort.col !== col) return '<span style="opacity:.3;font-size:.7em;">⇅</span>'
  return sort.asc ? '<span style="font-size:.7em;">▲</span>' : '<span style="font-size:.7em;">▼</span>'
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year:'2-digit', month:'numeric', day:'numeric' })
}

function countBy(arr, key) {
  return arr.reduce((acc, r) => { acc[r[key]] = (acc[r[key]] || 0) + 1; return acc }, {})
}

function pillCls(status) {
  const map = { new:'pill-new', reviewing:'pill-reviewing', approved:'pill-active',
                active:'pill-active', declined:'pill-expired', promoted:'pill-promoted',
                matched:'pill-matched', expired:'pill-expired' }
  return map[status] || 'pill-new'
}

function ilPillCls(s) {
  return pillCls(s)
}

function setArea(id, html) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = html
}

function loading() {
  return `<div class="loading-state">
    <i class="fa-solid fa-circle-notch fa-spin"></i>
    <p>Loading...</p>
    <p class="wake-hint">Still loading — the database may be waking up after inactivity. This usually takes 20-30 seconds and will resolve automatically.</p>
  </div>`
}

function emptyState(msg) {
  return `<div class="empty-state"><i class="fa-solid fa-filter"></i><p>${esc(msg)}</p></div>`
}

function errorState(err) {
  return `<div class="error-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${esc(err?.message || 'Error')}</p></div>`
}


function toast(msg, isError) {
  const container = document.getElementById('toast-container')
  const el = document.createElement('div')
  el.className = 'toast' + (isError ? ' toast-error' : '')
  el.textContent = msg
  container.appendChild(el)
  setTimeout(() => el.classList.add('toast-show'), 10)
  setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 300) }, 3000)
}

// =============================================================
// MATCHES
// =============================================================

async function loadMatches() {
  // Capture open blocks NOW, before setArea() wipes the DOM with the loading spinner
  const openBlocks = new Set(
    Array.from(document.querySelectorAll('[id^="match-body-"]'))
      .filter(el => el.style.display !== 'none')
      .map(el => el.id.replace('match-body-', ''))
  )

  setArea('matches-area', loading())
  try {
    const [
      { data: listings, error: lstErr },
      { data: results,  error: resErr },
      { data: cands,    error: cndErr },
      { data: il,       error: ilErr  },
    ] = await Promise.all([
      sb.from('listings').select('listing_id,listing_name,active,units_available').eq('active','YES'),
      sb.from('match_results').select('*').in('status', ['Pass','Close']),
      sb.from('listing_candidates').select('*'),
      sb.from('interest_list').select('id,email,full_name,submitted_at,status,credit_score_self,household_size,area_preference'),
    ])
    if (lstErr) throw lstErr
    if (resErr) throw resErr
    if (cndErr) throw cndErr
    if (ilErr)  throw ilErr

    candidatesData = cands || []
    renderMatches(listings || [], results || [], cands || [], il || [], openBlocks)
  } catch(e) {
    setArea('matches-area', errorState(e))
  }
}

function renderMatches(listings, results, cands, il, openBlocks = new Set()) {
  if (!listings.length) {
    setArea('matches-area', emptyState('No active listings. Set a listing to Active for Matching to see candidates here.'))
    return
  }

  // Build lookup: email -> IL row
  const ilByEmail = {}
  il.forEach(r => { ilByEmail[r.email] = r })

  // Build candidate status lookup: listing_id+email -> candidate row
  const candKey = (lid, email) => lid + '|' + email
  const candMap = {}
  cands.forEach(c => { candMap[candKey(c.listing_id, c.email)] = c })

  const html = listings.map(lst => {
    const lstResults = results.filter(r => r.listing_id === lst.listing_id)
    const passRows  = lstResults.filter(r => r.status === 'Pass')
    const closeRows = lstResults.filter(r => r.status === 'Close')

    // Merge pass+close, filter out matched/expired applicants, sort by submitted_at
    const allCandidates = [...passRows, ...closeRows].map(r => ({
      ...r,
      ilRow: ilByEmail[r.email] || null,
      cand:  candMap[candKey(lst.listing_id, r.email)] || null,
    })).filter(item => {
      // Always show approved candidates under their own listing
      if (item.cand?.status === 'approved') return true
      // Hide anyone whose IL status is no longer in the active pool
      const s = item.ilRow?.status
      return s !== 'matched' && s !== 'expired'
    }).sort((a, b) => {
      const da = a.ilRow?.submitted_at || a.email
      const db = b.ilRow?.submitted_at || b.email
      return da < db ? -1 : da > db ? 1 : 0
    })

    if (!allCandidates.length) return ''

    // Split into active queue and opted-out (approved always stays in active)
    const activeCandidates   = allCandidates.filter(item => !item.opted_out || item.cand?.status === 'approved')
    const optedOutCandidates = allCandidates.filter(item => item.opted_out && item.cand?.status !== 'approved')

    const unitsHtml = lst.units_available !== null && lst.units_available !== undefined
      ? `<span class="units-badge">${lst.units_available} unit${lst.units_available !== 1 ? 's' : ''} left</span>`
      : ''

    const buildRow = (item, rank, isOptedOut) => {
      const r   = item
      const ilR = item.ilRow
      const cnd = item.cand
      const isPass = r.status === 'Pass'
      const statusBadge = isPass
        ? '<span class="match-badge match-pass">Pass</span>'
        : '<span class="match-badge match-close">Close</span>'
      const failDetail = r.failed_fields
        ? `<div style="font-size:.72rem;color:#999;margin-top:.2rem;">${esc(r.failed_fields)}</div>` : ''

      if (isOptedOut) {
        return `<tr class="match-row-opted-out">
          <td class="match-rank">-</td>
          <td><strong>${esc(r.full_name || r.email)}</strong><br><span style="font-size:.78rem;">${esc(r.email)}</span></td>
          <td>${ilR ? fmtDate(ilR.submitted_at) : ''}</td>
          <td>${ilR ? (ilR.credit_score_self || '') : ''}</td>
          <td>${ilR ? (ilR.household_size || '') : ''}</td>
          <td>${statusBadge} <span class="match-badge match-opted-out">Opted Out</span></td>
          <td><div class="action-cell">
            <button class="btn-secondary btn-xs" onclick="optIn('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-rotate-left"></i> Opt Back In</button>
          </div></td>
        </tr>`
      }

      let actionHtml
      if (!cnd) {
        actionHtml = `
          <button class="btn-primary btn-xs" onclick="startReview('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-magnifying-glass"></i> Start Review</button>
          <button class="btn-secondary btn-xs" onclick="optOut('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-ban"></i> Opt Out</button>`
      } else if (cnd.status === 'in_review') {
        actionHtml = `
          <span class="status-pill pill-reviewing" style="margin-right:.35rem;">In Review</span>
          <button class="btn-primary btn-xs" onclick="approveCandidate(${cnd.id},'${esc(lst.listing_id)}','${esc(lst.listing_name||lst.listing_id)}','${esc(r.email)}','${esc(r.full_name||'')}')"><i class="fa-solid fa-check"></i> Approve</button>
          <button class="btn-danger btn-xs"  onclick="declineCandidate(${cnd.id})"><i class="fa-solid fa-xmark"></i> Decline</button>`
      } else if (cnd.status === 'approved') {
        actionHtml = `<span class="status-pill pill-matched">Approved</span>`
      } else {
        // declined — allow re-assignment
        actionHtml = `
          <span class="status-pill pill-expired" style="margin-right:.35rem;">Declined</span>
          <button class="btn-secondary btn-xs" onclick="startReview('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-rotate-left"></i> Re-assign</button>`
      }

      const isStar = rank === 1 && !cnd
      return `<tr class="${isPass ? 'match-row-pass' : 'match-row-close'}${isStar ? ' match-priority' : ''}">
        <td class="match-rank">#${rank}${isStar ? ' <span class="priority-star" title="Next in line">★</span>' : ''}</td>
        <td><strong>${esc(r.full_name || r.email)}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.email)}</span></td>
        <td>${ilR ? fmtDate(ilR.submitted_at) : ''}</td>
        <td>${ilR ? (ilR.credit_score_self || '') : ''}</td>
        <td>${ilR ? (ilR.household_size || '') : ''}</td>
        <td>${statusBadge}${failDetail}</td>
        <td><div class="action-cell">${actionHtml}</div></td>
      </tr>`
    }

    const activeRows = activeCandidates.map((item, i) => buildRow(item, i + 1, false)).join('')

    const optedOutSection = optedOutCandidates.length ? `
      <tr class="match-opted-out-divider">
        <td colspan="7">Opted out of this property (${optedOutCandidates.length})</td>
      </tr>
      ${optedOutCandidates.map(item => buildRow(item, 0, true)).join('')}` : ''

    const blockId = esc(lst.listing_id).replace(/[^a-zA-Z0-9]/g, '-')
    return `<div class="match-listing-block">
      <div class="match-listing-header" onclick="toggleMatchBlock('${blockId}')" style="cursor:pointer;">
        <div>
          <span class="match-listing-name">${esc(lst.listing_name || lst.listing_id)}</span>
          ${unitsHtml}
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;">
          <span class="match-count-badge pass">${passRows.length} Pass</span>
          <span class="match-count-badge close">${closeRows.length} Close</span>
          <i id="match-chevron-${blockId}" class="fa-solid fa-chevron-down" style="font-size:.85rem;color:#888;transition:transform .2s;"></i>
        </div>
      </div>
      <div id="match-body-${blockId}" style="display:none;">
        <table class="data-table" style="margin-top:.5rem;">
          <thead><tr>
            <th style="width:60px;">Priority</th>
            <th>Applicant</th>
            <th>Submitted</th>
            <th>Credit</th>
            <th>HH Size</th>
            <th>Match</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>${activeRows}${optedOutSection}</tbody>
        </table>
      </div>
    </div>`
  }).filter(Boolean).join('')

  setArea('matches-area', html || emptyState('No Pass or Close matches found for active listings. Run the match engine to populate results.'))

  // Re-expand any blocks that were open before the re-render
  openBlocks.forEach(blockId => {
    const body    = document.getElementById('match-body-'    + blockId)
    const chevron = document.getElementById('match-chevron-' + blockId)
    if (body) {
      body.style.display      = 'block'
      if (chevron) chevron.style.transform = 'rotate(180deg)'
    }
  })
}

function toggleMatchBlock(blockId) {
  const body    = document.getElementById('match-body-' + blockId)
  const chevron = document.getElementById('match-chevron-' + blockId)
  if (!body) return
  const open = body.style.display !== 'none'
  body.style.display    = open ? 'none' : 'block'
  chevron.style.transform = open ? '' : 'rotate(180deg)'
}

async function startReview(listingId, email) {
  // Get IL row for submitted_at and name
  const ilRow = ilData.find(r => r.email === email)
  const { data: fresh } = ilRow ? { data: ilRow } : await sb.from('interest_list').select('full_name,submitted_at').eq('email', email).single()
  const name = fresh?.full_name || email
  const submittedAt = fresh?.submitted_at || null

  const { error } = await sb.from('listing_candidates').insert({
    listing_id: listingId,
    email,
    full_name: name,
    il_submitted_at: submittedAt,
    status: 'in_review',
  })
  if (error) { toast(error.message, true); return }
  toast(`${name} moved to In Review.`)
  loadMatches()
}

async function approveCandidate(candId, listingId, listingName, email, fullName) {
  if (!confirm(`Approve ${fullName || email} for ${listingName}? This will:\n- Mark them as Matched on the Interest List\n- Decrement units available\n- Log to Successes`)) return

  try {
    // 1. Mark candidate approved
    const { error: e1 } = await sb.from('listing_candidates').update({ status: 'approved' }).eq('id', candId)
    if (e1) throw e1

    // 2. Mark IL applicant as matched
    const { error: e2 } = await sb.from('interest_list').update({ status: 'matched', updated_at: new Date().toISOString() }).eq('email', email)
    if (e2) throw e2

    // 3. Decrement units_available and auto-inactive if 0
    const lst = lstData.find(r => r.listing_id === listingId)
    if (lst && lst.units_available !== null && lst.units_available !== undefined) {
      const newUnits = Math.max(0, parseInt(lst.units_available) - 1)
      const updates = { units_available: newUnits, updated_at: new Date().toISOString() }
      if (newUnits === 0) updates.active = 'NO'
      const { error: e3 } = await sb.from('listings').update(updates).eq('listing_id', listingId)
      if (e3) throw e3
      if (newUnits === 0) toast(`${listingName} has no units remaining and has been set to inactive.`)
    }

    // 4. Log to successes
    const { error: e4 } = await sb.from('successes').insert({
      listing_id:   listingId,
      listing_name: listingName,
      email,
      full_name:    fullName || email,
      approved_at:  new Date().toISOString(),
    })
    if (e4) throw e4

    // 5. Remove match_results for all OTHER listings so they stop appearing
    //    in the Matches tab. Their result for the approved listing stays intact.
    await sb.from('match_results').delete().eq('email', email).neq('listing_id', listingId)

    toast(`${fullName || email} approved! Logged to Successes.`)
    lstData = []
    loadMatches()
  } catch(e) {
    toast(e.message, true)
  }
}

async function declineCandidate(candId) {
  const { error } = await sb.from('listing_candidates').update({ status: 'declined' }).eq('id', candId)
  if (error) { toast(error.message, true); return }
  toast('Candidate declined.')
  loadMatches()
}

async function optOut(listingId, email) {
  const { error } = await sb.from('match_results')
    .update({ opted_out: true })
    .eq('listing_id', listingId)
    .eq('email', email)
  if (error) { toast(error.message, true); return }
  toast('Applicant opted out of this property. Their spot in line is preserved.')
  loadMatches()
}

async function optIn(listingId, email) {
  const { error } = await sb.from('match_results')
    .update({ opted_out: false })
    .eq('listing_id', listingId)
    .eq('email', email)
  if (error) { toast(error.message, true); return }
  toast('Applicant opted back in. They are restored to their original position.')
  loadMatches()
}

// =============================================================
// SUCCESSES
// =============================================================

async function loadSuccesses() {
  setArea('successes-area', loading())
  const { data, error } = await sb.from('successes').select('*').order('approved_at', { ascending: false })
  if (error) { setArea('successes-area', errorState(error)); return }
  successesData = data || []
  renderSuccesses()
}

function renderSuccesses() {
  if (!successesData.length) {
    setArea('successes-area', emptyState('No successes yet. Approve a candidate in the Matches tab to log one here.'))
    return
  }
  const html = `
    <div style="margin-bottom:1rem;font-size:.9rem;color:#666;">${successesData.length} successful match${successesData.length !== 1 ? 'es' : ''} — click any row to view details</div>
    <table class="data-table">
      <thead><tr>
        <th>Date</th>
        <th>Family</th>
        <th>Listing</th>
        <th>Final Notes</th>
      </tr></thead>
      <tbody>
        ${successesData.map((r, i) => `<tr class="clickable-row" onclick="openSuccessModal(${i})">
          <td>${fmtDate(r.approved_at)}</td>
          <td><strong>${esc(r.full_name || '')}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.email || '')}</span></td>
          <td>${esc(r.listing_name || r.listing_id || '')}</td>
          <td style="font-size:.82rem;color:#666;">${esc(r.final_notes || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`
  setArea('successes-area', html)
}

let viewingSuccessRow = null

function openSuccessModal(idx) {
  viewingSuccessRow = successesData[idx]
  const r = viewingSuccessRow

  // Find matching IL record and listing record from cached data
  const il = ilData.find(a => a.email === r.email) || {}
  const lst = lstData.find(l => l.listing_id === r.listing_id) || {}

  const pipelineSteps = [
    { label: 'Form Submitted', date: il.submitted_at || null, color: '#4a7c6a' },
    { label: 'Approved / Matched', date: r.approved_at || null, color: '#2c5545' },
  ].filter(s => s.date)

  const pipelineHtml = `
    <div class="success-pipeline">
      ${pipelineSteps.map((s, i) => `
        <div class="success-pipeline-step">
          <div class="pipeline-dot" style="background:${s.color};"></div>
          <div>
            <div class="pipeline-step-label">${s.label}</div>
            <div class="pipeline-step-date">${fmtDate(s.date)}</div>
          </div>
        </div>
        ${i < pipelineSteps.length - 1 ? '<div class="pipeline-connector"></div>' : ''}
      `).join('')}
    </div>`

  const ilRows = [
    ['Email', il.email],
    ['Phone', il.phone],
    ['Area Preference', il.area_preference],
    ['Household Size', il.household_size],
    ['Credit Score', il.credit_score_self],
    ['SD County Resident', il.live_in_sd_county],
    ['Status at Approval', r.status || 'matched'],
  ].filter(([,v]) => v != null && v !== '')
   .map(([l,v]) => `<div class="field-row"><span class="field-label">${esc(l)}</span><span class="field-value">${esc(String(v))}</span></div>`)
   .join('')

  const lstRows = [
    ['Listing Name', lst.listing_name || r.listing_name],
    ['Listing ID', r.listing_id],
    ['Address', lst.prop_address || lst.address],
    ['City', lst.city],
    ['AMI %', lst.ami_percent ? lst.ami_percent + '%' : null],
    ['Bedrooms', lst.bedrooms],
    ['Price', lst.price ? '$' + lst.price : null],
  ].filter(([,v]) => v != null && v !== '')
   .map(([l,v]) => `<div class="field-row"><span class="field-label">${esc(l)}</span><span class="field-value">${esc(String(v))}</span></div>`)
   .join('')

  const ilNotes = il.additional_info
    ? `<div class="field-group il-section" style="margin-top:.75rem;">
         <div class="field-group-title" style="color:var(--muted);">Interest List Notes (read only)</div>
         <div style="padding:.6rem .75rem;font-size:.82rem;white-space:pre-wrap;line-height:1.5;color:#666;">${esc(il.additional_info)}</div>
       </div>`
    : ''

  document.getElementById('success-modal-title').textContent = r.full_name || r.email
  document.getElementById('success-modal-body').innerHTML = `
    <div class="field-group il-section" style="margin-bottom:.75rem;">
      <div class="field-group-title">Pipeline Timeline</div>
      ${pipelineHtml}
    </div>
    <div class="success-two-col">
      <div class="field-group il-section">
        <div class="field-group-title">Applicant</div>
        ${ilRows || '<div style="padding:.5rem .75rem;color:#aaa;font-size:.82rem;">No cached applicant data</div>'}
        ${ilNotes}
      </div>
      <div class="field-group il-section">
        <div class="field-group-title">Property</div>
        ${lstRows || '<div style="padding:.5rem .75rem;color:#aaa;font-size:.82rem;">No cached listing data</div>'}
      </div>
    </div>`

  document.getElementById('success-final-notes').value = r.final_notes || ''
  document.getElementById('success-modal-overlay').classList.add('open')
}

function closeSuccessModal() {
  document.getElementById('success-modal-overlay').classList.remove('open')
  viewingSuccessRow = null
}

document.getElementById('success-modal-close').addEventListener('click', closeSuccessModal)
document.getElementById('success-modal-close2').addEventListener('click', closeSuccessModal)

document.getElementById('success-save-notes-btn').addEventListener('click', async () => {
  if (!viewingSuccessRow) return
  const notes = document.getElementById('success-final-notes').value
  const { error } = await sb.from('successes').update({ final_notes: notes }).eq('id', viewingSuccessRow.id)
  if (error) { toast(error.message, true); return }
  viewingSuccessRow.final_notes = notes
  const idx = successesData.indexOf(viewingSuccessRow)
  if (idx !== -1) successesData[idx].final_notes = notes
  toast('Notes saved.')
  renderSuccesses()
})

document.getElementById('success-delete-btn').addEventListener('click', async () => {
  if (!viewingSuccessRow) return
  if (!confirm(`Permanently delete this success record for ${viewingSuccessRow.full_name || viewingSuccessRow.email}?\n\nThis removes the record from the Admin portal but does not change the applicant's status on the Interest List. This cannot be undone.`)) return
  const { error } = await sb.from('successes').delete().eq('id', viewingSuccessRow.id)
  if (error) { toast(error.message, true); return }
  toast('Success record deleted.')
  closeSuccessModal()
  successesData = []
  loadSuccesses()
})

// =============================================================
// HELP MODAL
// =============================================================

const HELP_CONTENT = {
  dashboard: {
    title: 'Dashboard',
    intro: 'The Dashboard gives you a snapshot of the entire pipeline at a glance. It shows live counts from every table so you can quickly see how many applicants, listings, and programs are active without navigating to each tab.',
    faq: [
      {
        q: 'What do the pipeline numbers mean?',
        a: `<ul>
          <li><strong>Applicants in matching</strong> — people on the Interest List with status New, Reviewing, or Active. These are the applicants the matching engine runs against each day.</li>
          <li><strong>In Matching listings</strong> — listings set to "In Matching." These are the properties the engine compares applicants against.</li>
          <li><strong>Program-linked</strong> — listings that have a site program attached.</li>
          <li><strong>Programs</strong> — total community or developer programs you have set up.</li>
          <li><strong>Property submissions</strong> — seller inquiries submitted through the public contact form.</li>
        </ul>`
      },
      {
        q: 'Why does it sometimes say "Database is waking up"?',
        a: 'The database is on a free-tier plan that goes to sleep after a period of inactivity. The first load after it has been idle can take 20 to 30 seconds. The page will load automatically once the database responds — no action needed.'
      }
    ]
  },

  properties: {
    title: 'Property Submissions',
    intro: 'This tab shows all seller inquiries submitted through the public "Submit a Property" form on the website. These are people who own a property and want to know if it qualifies for the affordable housing program. Click any row to open the full details.',
    faq: [
      {
        q: 'What information comes in with a submission?',
        a: 'Each submission includes the owner\'s contact info, the property address and type, bedrooms and bathrooms, asking price, and any notes they added. Click any row to see the full details and edit the record.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>All</strong> — shows every submission.</li>
          <li><strong>Non-Promoted</strong> — shows submissions not yet pushed to a Listing (default view).</li>
          <li><strong>Promoted</strong> — shows submissions that have already been converted to a Listing.</li>
        </ul>`
      },
      {
        q: 'How do I move a submission to a Listing?',
        a: 'Click the <strong>Promote</strong> button in the Actions column of any non-promoted submission. This opens the Add Listing modal pre-filled with the property\'s details so you can review and save it as an active Listing in the matching system. Once promoted, the button changes to "Promoted" and the submission is marked accordingly.'
      },
      {
        q: 'Can I edit a submission after it comes in?',
        a: 'Yes. Click anywhere on the submission row to open the detail modal. You can update the contact info, property details, and status from there.'
      }
    ]
  },

  listings: {
    title: 'Listings',
    intro: 'Listings are the internal property records that the matching engine runs against. They are never shown to applicants. This tab is where you create, edit, and manage all properties in the system.',
    faq: [
      {
        q: 'What do "In Matching" and "Not Matching" mean?',
        a: '<strong>In Matching</strong> means the listing is active and the daily matching engine will compare all eligible applicants against it. <strong>Not Matching</strong> means the listing is paused and skipped during the matching run. Use the <strong>In Matching</strong> toggle at the top of the Edit modal to switch between them.'
      },
      {
        q: 'Which eligibility fields are actually required for matching?',
        a: 'Only fields where you have entered a value are checked during matching. If a field is left blank, the matching engine skips that check entirely — it does not fail or penalize applicants for it. This means each listing can have its own unique combination of requirements. For example, if one listing does not care about foreclosure history, leave that field empty and it will not affect scores. If another listing requires a minimum credit score of 680, enter that value and the engine will enforce it for that listing only.'
      },
      {
        q: 'What does "Program-Linked" mean?',
        a: 'A listing is program-linked when it has a site program attached to it. Site programs (managed in the Programs tab) represent community developments or developer partnerships. Linking a listing to a program helps you track which properties belong to which development.'
      },
      {
        q: 'How do I add a new listing?',
        a: 'Click the <strong>+ Add Listing</strong> button in the toolbar at the top of the tab. Fill in the property details in the modal that appears and click Save.'
      },
      {
        q: 'How do I link a listing to a program?',
        a: 'Open the Edit modal for a listing. At the very top is a <strong>Site Program</strong> dropdown. Select the program from the list. If the program does not exist yet, click <strong>+ New Program</strong> — this will take you to the Programs tab and open a new program form pre-filled with the listing name.'
      },
      {
        q: 'How do I delete a listing?',
        a: 'Click the <strong>trash icon</strong> on a listing card. You will be asked to confirm before it is permanently deleted. Once deleted, the listing is removed from the matching engine immediately. Any existing match results that reference this listing will remain in the database as a historical record on the Matches tab until the next matching run refreshes them.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>All</strong> — shows every listing regardless of status.</li>
          <li><strong>In Matching</strong> — shows only active listings (default view).</li>
          <li><strong>Not Matching</strong> — shows only paused listings.</li>
          <li><strong>Program-Linked</strong> — shows only listings attached to a site program.</li>
        </ul>`
      }
    ]
  },

  programs: {
    title: 'Programs',
    intro: 'Programs represent community developments, builder partnerships, or other housing initiatives that have multiple listings associated with them. They appear on the public-facing website as program cards.',
    faq: [
      {
        q: 'What is the difference between a Program and a Listing?',
        a: 'A <strong>Listing</strong> is an individual property. A <strong>Program</strong> is a community or development that may contain multiple listings. For example, a new 50-unit development would be one Program, and each available unit within it would be a separate Listing linked to that Program.'
      },
      {
        q: 'How do I add a new program?',
        a: 'Click the <strong>+ Add Program</strong> button in the toolbar at the top of the tab. Fill in the program name, description, location, eligibility notes, and any relevant links. Set the status to <strong>Active</strong> to show it on the public site.'
      },
      {
        q: 'What does Active / Inactive mean for programs?',
        a: '<strong>Active</strong> programs are published and visible to visitors on the website. <strong>Inactive</strong> programs are hidden from the public but remain in the database for your records.'
      },
      {
        q: 'Can I edit a program after creating it?',
        a: 'Yes. Click the <strong>Edit</strong> button (pencil icon) on any program card to open the edit modal. Changes are saved immediately to the database and update the public website on the next page load.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>All</strong> — shows every program.</li>
          <li><strong>Active</strong> — shows only publicly visible programs (default view).</li>
          <li><strong>Inactive</strong> — shows only hidden programs.</li>
        </ul>`
      }
    ]
  },

  'interest-list': {
    title: 'Interest List',
    intro: 'The Interest List contains every applicant who has submitted the contact form on the website. This is the pool of people the matching engine runs against each day. Click any row to open the applicant detail, update their status, or delete their record.',
    faq: [
      {
        q: 'What are all the status options and what do they mean?',
        a: `<ul>
          <li><strong>New</strong> — submitted the form and has not been reviewed yet. Included in daily matching.</li>
          <li><strong>Reviewing</strong> — you are actively evaluating this applicant. Included in daily matching.</li>
          <li><strong>Active</strong> — qualified and actively waiting for a match. Included in daily matching. Subject to 12-month automatic expiry.</li>
          <li><strong>Matched</strong> — successfully placed in a home. Excluded from matching.</li>
          <li><strong>Expired</strong> — 12 months have passed without a match. Excluded from matching. If they re-submit the form, they are automatically re-enrolled.</li>
        </ul>`
      },
      {
        q: 'How do I change an applicant\'s status?',
        a: 'Click any row to open the applicant detail modal. The <strong>Status</strong> selector is at the top of the modal. Choose the new status and click <strong>Save Status</strong>. Changes take effect immediately for the next matching run.'
      },
      {
        q: 'What do the filter buttons do?',
        a: 'You can filter by status (All, New, Reviewing, Active, Matched, Expired) to focus on a specific group. The search box lets you find a specific applicant by name or email.'
      },
      {
        q: 'How do I delete an applicant?',
        a: 'Click any row to open the applicant detail modal. At the bottom of the modal is a red <strong>Delete Applicant</strong> button. You will be asked to confirm before the record is permanently removed. This also removes all their match results.'
      },
      {
        q: 'What happens when someone re-submits the form?',
        a: 'If their email already exists in the system and their status is <strong>Expired</strong>, they are automatically re-enrolled: their status is reset, the 12-month clock restarts, and their data is updated. If their status is anything other than Expired, their data is updated in place but their status and submission date are preserved.'
      }
    ]
  },

  matches: {
    title: 'Matches',
    intro: 'The Matches tab shows the results of the daily matching engine. For each active listing, you can see which applicants passed, which came close, and which did not qualify. This is where you decide who to reach out to.',
    faq: [
      {
        q: 'How does the matching engine work?',
        a: 'Every morning the engine compares every applicant with status New, Reviewing, or Active against every In Matching listing. It runs checks covering credit score, first-time buyer status, household size, AMI income, debt-to-income ratio, monthly debt, San Diego County residency, household together months, SDHC prior purchase, foreclosure history, bankruptcy history, judgments, and citizenship. Results are saved to the database.'
      },
      {
        q: 'What do Pass, Close, and Fail mean?',
        a: `<ul>
          <li><strong>Pass</strong> — the applicant meets all requirements for this listing. They are your top candidates to contact.</li>
          <li><strong>Close</strong> — the applicant failed 1 or 2 checks. They may still be worth reaching out to depending on the situation.</li>
          <li><strong>Fail</strong> — the applicant failed 3 or more checks. They do not qualify for this listing at this time.</li>
        </ul>`
      },
      {
        q: 'What is the star icon next to a candidate?',
        a: 'The star marks the <strong>top-ranked</strong> Pass or Close candidate for a listing. Ranking is first come, first served based on submission date. The star moves to the next eligible person if the top-ranked candidate opts out or is moved to Matched status.'
      },
      {
        q: 'What does "Opt Out" do?',
        a: 'Clicking <strong>Opt Out</strong> records that this applicant has decided they are not interested in this specific property. They remain on the Interest List and stay eligible for other listings. Their place in line for other listings is unaffected. The star moves to the next eligible person for this listing.'
      },
      {
        q: 'What does "Opt Back In" do?',
        a: 'If an applicant opted out of a listing but changes their mind, clicking <strong>Opt Back In</strong> restores them to their original position in line for that listing. Their rank is based on their original submission date.'
      },
      {
        q: 'How do I approve a match and log a success?',
        a: 'Find the applicant in the Pass or Close section for a listing. Click <strong>Approve</strong>. This changes the applicant\'s status to Matched (removing them from future matching runs) and logs the placement in the Successes tab.'
      },
      {
        q: 'Why does a listing show no candidates?',
        a: 'Either no applicants have passed or come close to the requirements for that listing, or the matching engine has not run yet today. The engine runs automatically each morning.'
      }
    ]
  },

  successes: {
    title: 'Successes',
    intro: 'The Successes tab is a permanent record of every applicant who has been matched and placed in a home. Click any row to open the full detail view showing the applicant profile, property info, pipeline timeline, and notes.',
    faq: [
      {
        q: 'How does a record get added here?',
        a: 'A success record is created automatically when you click <strong>Approve</strong> on a candidate in the Matches tab. The applicant\'s status is set to Matched and a log entry is created here with the date, name, and listing.'
      },
      {
        q: 'What is in the detail popup when I click a row?',
        a: `<ul>
          <li><strong>Pipeline Timeline</strong> — color-coded ladder showing when they submitted and when they were approved.</li>
          <li><strong>Applicant section</strong> — key info from their Interest List record, including any notes they submitted.</li>
          <li><strong>Property section</strong> — details about the listing they were matched to.</li>
          <li><strong>Final Notes</strong> — a text field where you can record the outcome, any follow-up needed, or other closing context.</li>
        </ul>`
      },
      {
        q: 'How do I add final notes to a success record?',
        a: 'Click the row to open the detail popup. Type in the <strong>Final Notes</strong> field at the bottom and click <strong>Save Notes</strong>. Final notes appear in the table so you can see them at a glance.'
      },
      {
        q: 'Can I delete a success record?',
        a: 'Yes. Open the detail popup by clicking the row, then click <strong>Delete Record</strong> at the bottom left. You will be asked to confirm. This permanently removes the success record from the admin portal but does not change the applicant\'s Matched status on the Interest List.'
      }
    ]
  }
}

function populateHelpPanel(tab) {
  const content = HELP_CONTENT[tab]
  if (!content) return
  document.getElementById('help-panel-title').textContent = content.title + ' Help'
  const faqHtml = content.faq.map(item => `
    <details>
      <summary>${esc(item.q)}</summary>
      <div class="help-answer">${item.a}</div>
    </details>
  `).join('')
  document.getElementById('help-panel-body').innerHTML = `
    <div class="help-intro">${content.intro}</div>
    <div class="help-faq-title">Frequently Asked Questions</div>
    <div class="help-faq">${faqHtml}</div>
  `
}

function openHelp() {
  const activeTab = document.querySelector('.sb-btn.active[data-tab]')?.dataset.tab || 'dashboard'
  populateHelpPanel(activeTab)
  document.getElementById('help-panel').classList.add('open')
  document.getElementById('admin-main').classList.add('help-open')
  helpPanelOpen = true
}

function closeHelp() {
  document.getElementById('help-panel').classList.remove('open')
  document.getElementById('admin-main').classList.remove('help-open')
  helpPanelOpen = false
}

document.getElementById('help-btn').addEventListener('click', openHelp)
document.getElementById('help-panel-close').addEventListener('click', closeHelp)
