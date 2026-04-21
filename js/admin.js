// =============================================================
// CA Affordable Homes - Admin JS
// Supabase-backed admin portal. No Apps Script required.
// =============================================================

const SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'
const SUBMIT_FN    = `${SUPABASE_URL}/functions/v1/submit-interest`

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit' }
})

// ── State ─────────────────────────────────────────────────────
let lstData = [], progData = [], ilData = [], psData = [], orgInqData = [], candidatesData = [], successesData = [], testimonialsData = []
let dashboardFetched = false
let helpPanelOpen = false
let matchRenderData = null   // cached args for renderMatches() — used by resize listener
let editingLstRow = null, editingProgRow = null, editingPsRow = null, viewingIlRow = null
let lstFilter = 'active', progFilter = 'active', ilFilter = 'all', psFilter = 'non-promoted', tmnFilter = 'active', oiFilter = 'new'
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

// Handle OAuth callback - if access_token is in the URL hash, set session manually
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
  document.body.classList.remove('admin-logged-in')
}

function showApp(session) {
  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('app').style.display = 'flex'
  document.body.classList.add('admin-logged-in')
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
  dashboard:       'Dashboard',
  testimonials:    'Testimonials',
  properties:      'Property Submissions',
  'org-inquiries': 'Org Inquiries',
  listings:        'Listings',
  programs:        'Programs',
  'interest-list': 'Interest List',
  matches:         'Matches',
  successes:       'Successes',
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
  if (tab === 'testimonials')  { if (!testimonialsData.length) loadTestimonials(); else renderTestimonialsAdmin() }
  if (tab === 'properties')    { if (!psData.length)   loadPS();           else renderPS()           }
  if (tab === 'org-inquiries') { if (!orgInqData.length) loadOrgInquiries(); else renderOrgInquiries() }
  if (tab === 'listings')      { if (!lstData.length)  loadListings();     else renderListings()     }
  if (tab === 'programs')      { if (!progData.length) loadPrograms();     else renderPrograms()     }
  if (tab === 'interest-list') { if (!ilData.length)   loadInterestList(); else renderIL()           }
  if (tab === 'matches')       loadMatches()
  if (tab === 'successes')     loadSuccesses()
}

function refreshCurrentTab() {
  const tab = document.querySelector('.sb-btn.active[data-tab]')?.dataset.tab || 'dashboard'
  lstData = []; progData = []; ilData = []; psData = []; orgInqData = []; candidatesData = []; successesData = []; testimonialsData = []
  dashboardFetched = false
  loadActiveTab(tab)
}
document.getElementById('refresh-btn').addEventListener('click', refreshCurrentTab)

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (dashboardFetched) { renderDashboard(); return }

  setArea('dashboard-area', loading())
  try {
    // Sequential queries - avoids connection pool exhaustion during cold start.
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

// =============================================================
// TESTIMONIALS
// =============================================================

document.getElementById('tmn-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  tmnFilter = btn.dataset.tf || 'active'
  renderTestimonialsAdmin()
})
document.getElementById('tmn-add-btn').addEventListener('click', () => openTmnModal(null))

async function loadTestimonials() {
  setArea('tmn-area', loading())
  const { data, error } = await sb.from('testimonials').select('*').order('id', { ascending: true })
  if (error) { setArea('tmn-area', errorState(error)); return }
  testimonialsData = data || []
  renderTestimonialsAdmin()
}

function renderTestimonialsAdmin() {
  const filterBtns = document.querySelectorAll('#tmn-filter-bar .filter-btn')
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.tf === tmnFilter))

  let rows = testimonialsData
  if (tmnFilter === 'active')   rows = testimonialsData.filter(r => r.active)
  if (tmnFilter === 'inactive') rows = testimonialsData.filter(r => !r.active)

  if (!rows.length) {
    setArea('tmn-area', emptyState(tmnFilter === 'active' ? 'No active testimonials. Click + Add Testimonial to create one.' : 'No testimonials match this filter.'))
    return
  }

  const html = `
    <div style="margin-bottom:1rem;font-size:.9rem;color:#666;">${rows.length} testimonial${rows.length !== 1 ? 's' : ''} - click any row to edit</div>
    <table class="data-table">
      <thead><tr>
        <th>Quote</th>
        <th>Name / Attribution</th>
        <th>Role</th>
        <th>Status</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="clickable-row" onclick="openTmnModal(${r.id})">
          <td style="max-width:320px;"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;">${esc(r.quote || '')}</div></td>
          <td>${esc(r.name || '')}</td>
          <td>${esc(r.role || '')}</td>
          <td><span class="status-pill ${r.active ? 'pill-active' : 'pill-expired'}">${r.active ? 'Active' : 'Inactive'}</span></td>
          <td><div class="action-cell">
            <button class="btn-danger btn-xs" onclick="event.stopPropagation();deleteTmn(${r.id})"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>`
  setArea('tmn-area', html)
}

let editingTmnId = null

function openTmnModal(id) {
  editingTmnId = id
  const r = id ? testimonialsData.find(x => x.id === id) : null
  document.getElementById('tmn-modal-title').textContent = r ? 'Edit Testimonial' : 'Add Testimonial'
  document.getElementById('tmn-quote').value  = r?.quote || ''
  document.getElementById('tmn-name').value   = r?.name  || ''
  document.getElementById('tmn-role').value   = r?.role  || ''
  document.getElementById('tmn-active').checked = r ? !!r.active : true
  document.getElementById('tmn-delete-btn').style.display = r ? '' : 'none'
  document.getElementById('tmn-modal-overlay').classList.add('open')
}

function closeTmnModal() {
  document.getElementById('tmn-modal-overlay').classList.remove('open')
  editingTmnId = null
}

document.getElementById('tmn-modal-close').addEventListener('click', closeTmnModal)
document.getElementById('tmn-cancel-btn').addEventListener('click', closeTmnModal)
document.getElementById('tmn-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('tmn-modal-overlay')) closeTmnModal()
})

document.getElementById('tmn-save-btn').addEventListener('click', async () => {
  const quote  = document.getElementById('tmn-quote').value.trim()
  const name   = document.getElementById('tmn-name').value.trim()
  const role   = document.getElementById('tmn-role').value.trim()
  const active = document.getElementById('tmn-active').checked
  if (!quote) { toast('Quote is required.', true); return }

  const payload = { quote, name: name || null, role: role || null, active }

  if (editingTmnId) {
    const { error } = await sb.from('testimonials').update(payload).eq('id', editingTmnId)
    if (error) { toast(error.message, true); return }
    const idx = testimonialsData.findIndex(x => x.id === editingTmnId)
    if (idx !== -1) testimonialsData[idx] = { ...testimonialsData[idx], ...payload }
    toast('Testimonial updated.')
  } else {
    const { data, error } = await sb.from('testimonials').insert(payload).select().single()
    if (error) { toast(error.message, true); return }
    testimonialsData.push(data)
    toast('Testimonial added.')
  }
  closeTmnModal()
  renderTestimonialsAdmin()
})

document.getElementById('tmn-delete-btn').addEventListener('click', async () => {
  if (!editingTmnId) return
  const r = testimonialsData.find(x => x.id === editingTmnId)
  if (!confirm(`Permanently delete this testimonial?\n\n"${(r?.quote || '').substring(0, 80)}..."\n\nThis cannot be undone.`)) return
  const { error } = await sb.from('testimonials').delete().eq('id', editingTmnId)
  if (error) { toast(error.message, true); return }
  testimonialsData = testimonialsData.filter(x => x.id !== editingTmnId)
  toast('Testimonial deleted.')
  closeTmnModal()
  renderTestimonialsAdmin()
})

async function deleteTmn(id) {
  const r = testimonialsData.find(x => x.id === id)
  if (!confirm(`Permanently delete this testimonial?\n\n"${(r?.quote || '').substring(0, 80)}..."\n\nThis cannot be undone.`)) return
  const { error } = await sb.from('testimonials').delete().eq('id', id)
  if (error) { toast(error.message, true); return }
  testimonialsData = testimonialsData.filter(x => x.id !== id)
  toast('Testimonial deleted.')
  renderTestimonialsAdmin()
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

  // ── Mobile card layout ──
  if (window.innerWidth <= 768) {
    const cards = rows.map(r => {
      const idx = psData.indexOf(r)
      const isPromoted = (r.status||'new') === 'promoted'
      const promoteBtn = isPromoted
        ? `<span class="ps-mc-promoted"><i class="fa-solid fa-check"></i> Promoted</span>`
        : `<button class="btn-primary btn-xs" onclick="event.stopPropagation();promoteToListing(${idx})"><i class="fa-solid fa-arrow-up-right-from-square"></i> Promote</button>`
      const metaParts = []
      if (r.ami_percent) metaParts.push(`<span><i class="fa-solid fa-percent"></i> ${esc(r.ami_percent)}% AMI</span>`)
      if (r.bedrooms)    metaParts.push(`<span><i class="fa-solid fa-bed"></i> ${esc(r.bedrooms)} bd</span>`)
      if (r.bathrooms)   metaParts.push(`<span><i class="fa-solid fa-bath"></i> ${esc(r.bathrooms)} ba</span>`)
      if (r.affordable_price) metaParts.push(`<span><i class="fa-solid fa-tag"></i> $${esc(r.affordable_price)}</span>`)
      return `<div class="ps-mobile-card${isPromoted ? ' ps-mc-is-promoted' : ''}" onclick="openPSModal(${idx})">
        <div class="ps-mc-top">
          <span class="ps-mc-name">${esc(r.contact_name||'Unknown')}</span>
          <span class="ps-mc-date">${fmtDate(r.submitted_at)}</span>
        </div>
        ${r.contact_email ? `<div class="ps-mc-email"><i class="fa-solid fa-envelope"></i> ${esc(r.contact_email)}</div>` : ''}
        ${r.prop_address  ? `<div class="ps-mc-address"><i class="fa-solid fa-location-dot"></i> ${esc(r.prop_address)}</div>` : ''}
        ${metaParts.length ? `<div class="ps-mc-meta">${metaParts.join('')}</div>` : ''}
        <div class="ps-mc-actions" onclick="event.stopPropagation()">${promoteBtn}
          <button class="btn-secondary btn-xs" onclick="openPSModal(${idx})"><i class="fa-solid fa-pen"></i> Edit</button>
        </div>
      </div>`
    }).join('')
    setArea('ps-area', `<div class="ps-card-list">${cards}</div>`)
    return
  }

  // ── Desktop table layout ──
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
// ORG INQUIRIES
// ─────────────────────────────────────────────────────────────
document.getElementById('oi-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn')
  if (!btn) return
  oiFilter = btn.dataset.oif || 'all'
  renderOrgInquiries()
})

async function loadOrgInquiries() {
  setArea('oi-area', loading())
  const { data, error } = await sb.from('org_inquiries').select('*').order('submitted_at', { ascending: false })
  if (error) { setArea('oi-area', errorState(error)); return }
  orgInqData = data || []
  renderOrgInquiries()
}

function renderOrgInquiries() {
  document.querySelectorAll('#oi-filter-bar .filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.oif === oiFilter))

  let rows = orgInqData
  if (oiFilter === 'new')      rows = orgInqData.filter(r => r.status === 'new')
  if (oiFilter === 'reviewed') rows = orgInqData.filter(r => r.status === 'reviewed')

  if (!rows.length) { setArea('oi-area', emptyState('No org inquiries yet.')); return }

  const html = `<div class="oi-list">
    ${rows.map(r => {
      const d = r.submitted_at ? new Date(r.submitted_at) : null
      const dateStr = d ? d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : ''
      const isNew = r.status === 'new'
      return `<div class="oi-card${isNew ? ' oi-card--new' : ''}">
        <div class="oi-card-header">
          <div>
            <div class="oi-contact-name">${esc(r.contact_name || '(No name)')}</div>
            ${r.organization ? `<div class="oi-org">${esc(r.organization)}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0;">
            ${isNew ? `<span class="status-pill pill-new">New</span>` : `<span class="status-pill pill-reviewed">Reviewed</span>`}
            <span style="font-size:.75rem;color:#aaa;">${esc(dateStr)}</span>
          </div>
        </div>
        <div class="oi-card-body">
          <div class="oi-contact-row">
            ${r.contact_email ? `<a href="mailto:${esc(r.contact_email)}" class="oi-contact-link"><i class="fa-solid fa-envelope"></i> ${esc(r.contact_email)}</a>` : ''}
            ${r.contact_phone ? `<a href="tel:${esc(r.contact_phone)}" class="oi-contact-link"><i class="fa-solid fa-phone"></i> ${esc(r.contact_phone)}</a>` : ''}
          </div>
          ${r.message ? `<div class="oi-message">${esc(r.message)}</div>` : ''}
        </div>
        <div class="oi-card-footer">
          ${isNew
            ? `<button class="btn-secondary btn-sm" onclick="markOiReviewed(${r.id})"><i class="fa-solid fa-check"></i> Mark Reviewed</button>`
            : `<button class="btn-secondary btn-sm" onclick="markOiNew(${r.id})"><i class="fa-solid fa-rotate-left"></i> Mark New</button>`}
          <button class="btn-danger btn-xs" onclick="deleteOi(${r.id})" style="margin-left:auto;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  </div>`
  setArea('oi-area', html)
}

async function markOiReviewed(id) {
  const { error } = await sb.from('org_inquiries').update({ status: 'reviewed' }).eq('id', id)
  if (error) { toast(error.message, true); return }
  const idx = orgInqData.findIndex(r => r.id === id)
  if (idx >= 0) orgInqData[idx].status = 'reviewed'
  renderOrgInquiries()
}

async function markOiNew(id) {
  const { error } = await sb.from('org_inquiries').update({ status: 'new' }).eq('id', id)
  if (error) { toast(error.message, true); return }
  const idx = orgInqData.findIndex(r => r.id === id)
  if (idx >= 0) orgInqData[idx].status = 'new'
  renderOrgInquiries()
}

async function deleteOi(id) {
  if (!confirm('Delete this inquiry? This cannot be undone.')) return
  const { error } = await sb.from('org_inquiries').delete().eq('id', id)
  if (error) { toast(error.message, true); return }
  toast('Inquiry deleted.')
  orgInqData = orgInqData.filter(r => r.id !== id)
  renderOrgInquiries()
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
  if (lstFilter === 'on-site')     rows = lstData.filter(r =>  r.linked_program_id)
  if (lstFilter === 'not-on-site') rows = lstData.filter(r => !r.linked_program_id)

  if (!rows.length) { setArea('lst-area', emptyState('No listings match this filter.')); return }

  const html = `<div class="prog-grid">
    ${rows.map(r => {
      const idx = lstData.indexOf(r)
      const progBadge = r.linked_program_id
        ? `<div class="lst-prog-link">
            <div class="lst-prog-link-label"><i class="fa-solid fa-link" style="font-size:.6rem;"></i> Linked Program</div>
            <div class="lst-prog-link-name"><i class="fa-solid fa-globe" style="font-size:.72rem;"></i> ${esc(r.linked_program_id)}</div>
          </div>`
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
          ${r.internal_notes ? `<div class="lst-card-notes">${esc(r.internal_notes)}</div>` : ''}
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
  document.getElementById('lf-zip').value         = p.zip_code || ''
  document.getElementById('lf-price').value       = p.price || ''
  document.getElementById('lf-beds').value        = p.bedrooms || ''
  document.getElementById('lf-baths').value       = p.bathrooms || ''
  document.getElementById('lf-sqft').value        = p.sqft || ''
  document.getElementById('lf-program-type').value = p.program_type || ''
  document.getElementById('lf-credit').value      = p.min_credit_score || ''
  document.getElementById('lf-ftb').value         = p.first_time_buyer_required || ''
  document.getElementById('lf-dti').value         = p.max_dti_percent || ''
  document.getElementById('lf-debt').value        = p.max_monthly_debt || ''
  document.getElementById('lf-sdres').value       = p.sd_county_residency_required || 'YES'
  document.getElementById('lf-prog-notes').value  = p.program_notes || ''
  document.getElementById('lf-int-notes').value   = p.internal_notes || ''
  document.getElementById('lf-src-row').value     = p.source_submission_row || ''
  document.getElementById('lf-sdmonths').value      = p.sd_residency_months || ''
  document.getElementById('lf-hhtogether').value    = p.household_together_months || ''
  document.getElementById('lf-ftb-years').value     = p.no_ownership_years || ''
  document.getElementById('lf-hhmin').value          = p.min_household_size || ''
  document.getElementById('lf-hhmax').value          = p.max_household_size || ''
  document.getElementById('lf-minassets').value      = p.min_assets || ''
  document.getElementById('lf-maxassets').value      = p.max_assets || ''
  // Populate AMI table from JSONB
  const amiTable = p.ami_table || {}
  ;[1,2,3,4,5,6,7,8].forEach(row => {
    ;[50,80,100,120].forEach(col => {
      const el = document.getElementById(`lf-ami-${row}-${col}`)
      if (el) el.value = (amiTable[row] && amiTable[row][col] != null) ? amiTable[row][col] : ''
    })
  })
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

  // Wire "New Program" button - pre-fills the program form from this listing's data
  document.getElementById('lf-new-prog-btn').onclick = () => {
    closeLSTModal()
    switchTab('programs')
    openProgModal(null, {
      community_name: p.listing_name || p.listing_id || '',
      area:           p.city || '',
      bedrooms:       p.bedrooms || '',
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

  // Build ami_table JSONB from grid inputs
  const amiTableOut = {}
  ;[1,2,3,4,5,6,7,8].forEach(row => {
    const rowData = {}
    ;[50,80,100,120].forEach(col => {
      const v = (document.getElementById(`lf-ami-${row}-${col}`) || {}).value || ''
      if (v.trim() !== '') rowData[col] = Number(v)
    })
    if (Object.keys(rowData).length) amiTableOut[row] = rowData
  })

  const listing = {
    listing_id:   id,
    listing_name: document.getElementById('lf-name').value.trim() || id,
    active:       document.getElementById('lf-active').checked ? 'YES' : 'NO',
    units_available: document.getElementById('lf-units').value !== '' ? parseInt(document.getElementById('lf-units').value) : null,
    listing_type: document.getElementById('lf-type').value,
    address:      document.getElementById('lf-address').value.trim(),
    city:         document.getElementById('lf-city').value.trim(),
    zip_code:     document.getElementById('lf-zip').value.trim() || null,
    price:        document.getElementById('lf-price').value.trim(),
    bedrooms:     document.getElementById('lf-beds').value.trim(),
    bathrooms:    document.getElementById('lf-baths').value.trim(),
    sqft:         document.getElementById('lf-sqft').value.trim(),
    program_type: document.getElementById('lf-program-type').value.trim(),
    min_credit_score:    document.getElementById('lf-credit').value.trim(),
    max_dti_percent:     document.getElementById('lf-dti').value.trim(),
    max_monthly_debt:    document.getElementById('lf-debt').value.trim(),
    first_time_buyer_required: document.getElementById('lf-ftb').value,
    sd_county_residency_required: document.getElementById('lf-sdres').value,
    program_notes:  document.getElementById('lf-prog-notes').value.trim(),
    internal_notes: document.getElementById('lf-int-notes').value.trim(),
    source_submission_row: document.getElementById('lf-src-row').value || null,
    linked_program_id:     document.getElementById('lf-linked-prog').value || null,
    sd_residency_months:        document.getElementById('lf-sdmonths').value.trim() || null,
    household_together_months:  document.getElementById('lf-hhtogether').value.trim() || null,
    no_ownership_years:         document.getElementById('lf-ftb-years').value.trim() || null,
    min_household_size:         document.getElementById('lf-hhmin').value.trim() || null,
    max_household_size:         document.getElementById('lf-hhmax').value.trim() || null,
    min_assets:                 document.getElementById('lf-minassets').value.trim() || null,
    max_assets:                 document.getElementById('lf-maxassets').value.trim() || null,
    ami_table:                  Object.keys(amiTableOut).length ? amiTableOut : null,
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
      const availUnits = lstData
        .filter(l => l.linked_program_id === p.community_name && l.active === 'YES' && l.units_available > 0)
        .reduce((sum, l) => sum + (l.units_available || 0), 0)
      return `<div class="prog-card ${bgCls}">
        <div class="prog-card-header">
          <div style="min-width:0;flex:1;">
            <div class="prog-card-name">${esc(p.community_name || 'Unnamed')}</div>
            <div class="prog-card-area"><i class="fa-solid fa-location-dot" style="color:#888;font-size:.75rem;margin-right:.3rem;"></i>${esc(p.area || '')}</div>
          </div>
          <span class="status-pill ${badgeCls}" style="flex-shrink:0;">${esc(p.status || '')}</span>
        </div>
        <div class="prog-card-body">
          ${p.property_type ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-house" style="width:14px;color:#888;margin-right:.3rem;"></i>Type</span><span class="prog-detail-value">${esc(p.property_type)}</span></div>` : ''}
          ${p.ami_percent    ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-chart-bar" style="width:14px;color:#888;margin-right:.3rem;"></i>AMI %</span><span class="prog-detail-value">${esc(String(p.ami_percent))}</span></div>` : ''}
          ${p.zip_code       ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-location-dot" style="width:14px;color:#888;margin-right:.3rem;"></i>Zip</span><span class="prog-detail-value">${esc(p.zip_code)}</span></div>` : ''}
          ${p.bedrooms       ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-bed" style="width:14px;color:#888;margin-right:.3rem;"></i>Bedrooms</span><span class="prog-detail-value">${esc(p.bedrooms)}</span></div>` : ''}
          ${p.household_size ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-people-group" style="width:14px;color:#888;margin-right:.3rem;"></i>HH Size</span><span class="prog-detail-value">${esc(p.household_size)}</span></div>` : ''}
          ${p.price_range    ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-tag" style="width:14px;color:#888;margin-right:.3rem;"></i>Price Range</span><span class="prog-detail-value">${esc(p.price_range)}</span></div>` : ''}
          ${p.notes ? `<div style="font-size:.78rem;color:#888;background:rgba(0,0,0,.04);border-radius:6px;padding:.45rem .6rem;margin-top:.2rem;">${esc(p.notes)}</div>` : ''}
          <div class="prog-listings-block">
            <div class="prog-listings-header"><i class="fa-solid fa-link" style="font-size:.6rem;"></i> Linked Listings${lnkLst.length ? ` (${lnkLst.length})` : ''}</div>
            ${lnkLst.length
              ? `<div class="prog-listings-pills">${lnkLst.map(name => `<span class="prog-listing-pill">${esc(name)}</span>`).join('')}</div>`
              : `<div class="prog-listings-empty">None linked yet</div>`}
          </div>
          <div class="prog-units-row">
            <i class="fa-solid fa-house-chimney" style="font-size:.7rem;"></i>
            ${availUnits > 0
              ? `<strong style="color:var(--green);">${availUnits}</strong> unit${availUnits === 1 ? '' : 's'} available`
              : `<span style="color:#bbb;">No units available</span>`}
          </div>
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
  document.getElementById('pf-name').value        = p.community_name || ''
  document.getElementById('pf-area').value        = p.area           || ''
  document.getElementById('pf-zip').value         = p.zip_code       || ''
  document.getElementById('pf-ami-pct').value     = p.ami_percent    || ''
  document.getElementById('pf-hh-size').value     = p.household_size || ''
  document.getElementById('pf-beds').value        = p.bedrooms       || ''
  document.getElementById('pf-price').value       = p.price_range    || ''
  document.getElementById('pf-status').value      = p.status         || 'Available'
  document.getElementById('pf-notes').value       = p.notes          || ''
  document.getElementById('pf-src-listing').value = p.source_listing_id || ''
  // Property type: handle "Other" case
  const knownTypes = ['Single Family Home','Detached','Townhome','Condo','Duplex','Manufactured Home']
  const ptVal = p.property_type || ''
  const isKnown = ptVal === '' || knownTypes.includes(ptVal)
  document.getElementById('pf-property-type').value = isKnown ? ptVal : 'Other'
  document.getElementById('pf-property-type-other-row').style.display = isKnown ? 'none' : 'block'
  document.getElementById('pf-property-type-other').value = isKnown ? '' : ptVal

  // Build linked listings list from lstData
  const progName = p.community_name || ''
  const lnkLst = lstData.filter(l => l.linked_program_id === progName)
  const labelEl = document.getElementById('pf-linked-listings-label')
  if (lnkLst.length) {
    labelEl.innerHTML = `
      <div class="prog-listings-header" style="margin-bottom:.4rem;"><i class="fa-solid fa-link" style="font-size:.6rem;"></i> Linked Listings (${lnkLst.length})</div>
      <div class="prog-listings-pills">
        ${lnkLst.map(l => `<span class="prog-listing-pill">${esc(l.listing_name || l.listing_id)}</span>`).join('')}
      </div>`
  } else {
    labelEl.innerHTML = editingProgRow
      ? '<div class="prog-listings-header" style="margin-bottom:.3rem;"><i class="fa-solid fa-link" style="font-size:.6rem;"></i> Linked Listings</div><div class="prog-listings-empty">None linked yet</div>'
      : ''
  }

  // Auto-mode: when linked listings exist, the aggregate fields are read-only
  // and Kacee should edit via the Listings tab instead.
  const isAutoMode = lnkLst.length > 0
  const autoFieldIds = ['pf-zip', 'pf-ami-pct', 'pf-hh-size', 'pf-beds', 'pf-price']
  autoFieldIds.forEach(fid => {
    const el = document.getElementById(fid)
    el.readOnly = isAutoMode
    el.classList.toggle('pf-auto-field', isAutoMode)
  })
  document.getElementById('pf-auto-banner').style.display = isAutoMode ? 'block' : 'none'
  document.getElementById('prog-sync-btn').style.display  = isAutoMode ? ''      : 'none'

  document.getElementById('prog-modal-overlay').classList.add('open')
}

function closeProgModal() {
  document.getElementById('prog-modal-overlay').classList.remove('open')
  editingProgRow = null
}

document.getElementById('pf-property-type').addEventListener('change', function () {
  document.getElementById('pf-property-type-other-row').style.display =
    this.value === 'Other' ? 'block' : 'none'
})

// "Sync Now" button — manually triggers sync_program_from_listings RPC
// then reloads the programs tab so updated values are visible.
document.getElementById('prog-sync-btn').addEventListener('click', async () => {
  const progName = document.getElementById('pf-name').value.trim()
  if (!progName) return
  const btn = document.getElementById('prog-sync-btn')
  btn.disabled = true
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...'
  const { error } = await sb.rpc('sync_program_from_listings', { p_community_name: progName })
  btn.disabled = false
  btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync Now'
  if (error) { toast('Sync failed: ' + error.message, true); return }
  toast('Program synced from listings.')
  closeProgModal()
  progData = []; lstData = []
  await loadPrograms()
  if (!lstData.length) await loadListingsQuiet()
})

document.getElementById('prog-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('pf-name').value.trim()
  const area = document.getElementById('pf-area').value.trim()
  if (!name || !area) { toast('Community Name and Area are required.', true); return }

  const btn = document.getElementById('prog-save-btn')
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...'

  const ptSel = document.getElementById('pf-property-type').value
  const property_type = ptSel === 'Other'
    ? (document.getElementById('pf-property-type-other').value.trim() || 'Other')
    : ptSel

  const prog = {
    community_name:   name,
    area,
    zip_code:         document.getElementById('pf-zip').value.trim()      || null,
    ami_percent:      document.getElementById('pf-ami-pct').value.trim()  || null,
    household_size:   document.getElementById('pf-hh-size').value.trim()  || null,
    property_type:    property_type || null,
    bedrooms:         document.getElementById('pf-beds').value.trim()     || null,
    price_range:      document.getElementById('pf-price').value.trim()    || null,
    status:           document.getElementById('pf-status').value,
    notes:            document.getElementById('pf-notes').value.trim()    || null,
    source_listing_id: document.getElementById('pf-src-listing').value.trim() || null,
    updated_at:       new Date().toISOString(),
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

  if (window.innerWidth <= 768) {
    // ── Mobile: card layout ──────────────────────────────────
    const cards = rows.map(r => {
      const idx  = ilData.indexOf(r)
      const area = (r.area_preference || '').substring(0, 50)
      return `<div class="il-mobile-card" onclick="openILModal(${idx})">
        <div class="il-mc-top">
          <span class="il-mc-name">${esc(r.full_name || 'Unknown')}</span>
          <span class="status-pill ${ilPillCls(r.status)}">${esc(r.status || '')}</span>
        </div>
        <div class="il-mc-email">${esc(r.email || '')}</div>
        ${r.phone ? `<div class="il-mc-sub">${esc(r.phone)}</div>` : ''}
        <div class="il-mc-meta">
          <span><i class="fa-solid fa-calendar-days" aria-hidden="true"></i> ${fmtDate(r.submitted_at)}</span>
          ${area ? `<span class="il-mc-area"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(area)}</span>` : ''}
        </div>
      </div>`
    }).join('')
    setArea('il-area', `<div class="il-card-list">${cards}</div>`)
  } else {
    // ── Desktop: sortable data table ─────────────────────────
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
      `<span class="field-value">${esc(source || '')}${amt ? ' - $' + esc(String(amt)) : ''}${endNote}</span></div>`
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
      ? (r[`emp_${n}_breaks_desc`] ? `Yes - ${r[`emp_${n}_breaks_desc`]}` : 'Yes')
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
    const prevStatus = viewingIlRow.status || 'new'
    if (newStatus === prevStatus) { toast('Status is already ' + newStatus + '.'); return }
    const historyEntry = { status: newStatus, prev: prevStatus, ts: new Date().toISOString(), note: 'Status changed in admin' }
    const currentHistory = Array.isArray(viewingIlRow.status_history) ? viewingIlRow.status_history : []
    const { error } = await sb.from('interest_list')
      .update({ status: newStatus, updated_at: new Date().toISOString(), status_history: [...currentHistory, historyEntry] })
      .eq('id', viewingIlRow.id)
    if (error) { toast(error.message, true); return }
    viewingIlRow.status = newStatus
    viewingIlRow.status_history = [...currentHistory, historyEntry]
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
    <p class="wake-hint">Still loading - the database may be waking up after inactivity. This usually takes 20-30 seconds and will resolve automatically.</p>
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
      sb.from('interest_list').select('id,email,full_name,submitted_at,status,credit_score_self,household_size,area_preference,status_history,phone,live_in_sd_county,additional_info'),
    ])
    if (lstErr) throw lstErr
    if (resErr) throw resErr
    if (cndErr) throw cndErr
    if (ilErr)  throw ilErr

    candidatesData = cands || []
    matchRenderData = { listings: listings || [], results: results || [], cands: cands || [], il: il || [] }
    renderMatches(matchRenderData.listings, matchRenderData.results, matchRenderData.cands, matchRenderData.il, openBlocks)
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
          <button class="btn-danger btn-xs"  onclick="declineCandidate(${cnd.id})"><i class="fa-solid fa-xmark"></i> Decline</button>
          <button class="btn-secondary btn-xs" onclick="optOut('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-ban"></i> Opt Out</button>`
      } else if (cnd.status === 'approved') {
        actionHtml = `<span class="status-pill pill-matched">Approved</span>`
      } else {
        // declined - allow re-assignment
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

    const isMobile = window.innerWidth <= 768

    // ── Mobile card builder ──────────────────────────────────
    const buildMobileCard = (item, rank, isOptedOut) => {
      const r   = item
      const ilR = item.ilRow
      const cnd = item.cand
      const isPass = r.status === 'Pass'
      const statusBadge = isPass
        ? '<span class="match-badge match-pass">Pass</span>'
        : '<span class="match-badge match-close">Close</span>'

      if (isOptedOut) {
        return `<div class="match-mobile-card match-mc-opted-out">
          <div class="match-mc-header">
            <div class="match-mc-name-block">
              <strong>${esc(r.full_name || r.email)}</strong>
              <span class="match-mc-candidate-email">${esc(r.email)}</span>
            </div>
            <span class="match-badge match-opted-out">Opted Out</span>
          </div>
          <div class="match-mc-actions">
            <button class="btn-secondary btn-xs" onclick="optIn('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-rotate-left"></i> Opt Back In</button>
          </div>
        </div>`
      }

      const isStar = rank === 1 && !cnd
      const failDetail = r.failed_fields
        ? `<div class="match-mc-fails"><i class="fa-solid fa-circle-exclamation"></i> ${esc(r.failed_fields)}</div>` : ''

      let actionHtml
      if (!cnd) {
        actionHtml = `
          <button class="btn-primary btn-xs" onclick="startReview('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-magnifying-glass"></i> Start Review</button>
          <button class="btn-secondary btn-xs" onclick="optOut('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-ban"></i> Opt Out</button>`
      } else if (cnd.status === 'in_review') {
        actionHtml = `
          <span class="status-pill pill-reviewing">In Review</span>
          <button class="btn-primary btn-xs" onclick="approveCandidate(${cnd.id},'${esc(lst.listing_id)}','${esc(lst.listing_name||lst.listing_id)}','${esc(r.email)}','${esc(r.full_name||'')}')"><i class="fa-solid fa-check"></i> Approve</button>
          <button class="btn-danger btn-xs" onclick="declineCandidate(${cnd.id})"><i class="fa-solid fa-xmark"></i> Decline</button>
          <button class="btn-secondary btn-xs" onclick="optOut('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-ban"></i> Opt Out</button>`
      } else if (cnd.status === 'approved') {
        actionHtml = `<span class="status-pill pill-matched">Approved</span>`
      } else {
        actionHtml = `
          <span class="status-pill pill-expired">Declined</span>
          <button class="btn-secondary btn-xs" onclick="startReview('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-rotate-left"></i> Re-assign</button>`
      }

      return `<div class="match-mobile-card ${isPass ? 'match-mc-pass' : 'match-mc-close'}${isStar ? ' match-mc-star' : ''}">
        <div class="match-mc-header">
          <span class="match-mc-rank">#${rank}${isStar ? ' <span class="priority-star">★</span>' : ''}</span>
          <div class="match-mc-name-block">
            <strong>${esc(r.full_name || r.email)}</strong>
            <span class="match-mc-candidate-email">${esc(r.email)}</span>
          </div>
          ${statusBadge}
        </div>
        ${failDetail}
        <div class="match-mc-meta">
          <span><i class="fa-solid fa-calendar-days"></i> ${ilR ? fmtDate(ilR.submitted_at) : 'N/A'}</span>
          ${ilR?.credit_score_self ? `<span><i class="fa-solid fa-credit-card"></i> ${ilR.credit_score_self}</span>` : ''}
          ${ilR?.household_size   ? `<span><i class="fa-solid fa-people-group"></i> ${ilR.household_size}</span>` : ''}
        </div>
        <div class="match-mc-actions">${actionHtml}</div>
      </div>`
    }

    // ── Build rows/cards ─────────────────────────────────────
    const activeContent = isMobile
      ? activeCandidates.map((item, i) => buildMobileCard(item, i + 1, false)).join('')
      : activeCandidates.map((item, i) => buildRow(item, i + 1, false)).join('')

    const optedOutContent = optedOutCandidates.length
      ? isMobile
        ? `<div class="match-mc-divider">Opted out of this listing (${optedOutCandidates.length})</div>
           ${optedOutCandidates.map(item => buildMobileCard(item, 0, true)).join('')}`
        : `<tr class="match-opted-out-divider">
             <td colspan="7">Opted out of this property (${optedOutCandidates.length})</td>
           </tr>
           ${optedOutCandidates.map(item => buildRow(item, 0, true)).join('')}`
      : ''

    const bodyContent = isMobile
      ? `<div class="match-mobile-list">${activeContent}${optedOutContent}</div>`
      : `<table class="data-table" style="margin-top:.5rem;">
           <thead><tr>
             <th style="width:60px;">Priority</th>
             <th>Applicant</th>
             <th>Submitted</th>
             <th>Credit</th>
             <th>HH Size</th>
             <th>Match</th>
             <th>Actions</th>
           </tr></thead>
           <tbody>${activeContent}${optedOutContent}</tbody>
         </table>`

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
        ${bodyContent}
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
  const { data: fresh } = ilRow ? { data: ilRow } : await sb.from('interest_list').select('*').eq('email', email).single()
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

  // Log start review event to IL status_history
  if (fresh) {
    const lst = lstData.find(l => l.listing_id === listingId)
    const listingLabel = lst?.listing_name || listingId
    const currentHistory = Array.isArray(fresh.status_history) ? fresh.status_history : []
    const entry = { event: 'in_review', listing_id: listingId, listing_name: listingLabel, ts: new Date().toISOString(), note: 'Moved to In Review for ' + listingLabel }
    await sb.from('interest_list').update({ status_history: [...currentHistory, entry] }).eq('email', email)
    // Update local cache
    if (ilRow) ilRow.status_history = [...currentHistory, entry]
  }

  toast(`${name} moved to In Review.`)
  loadMatches()
}

async function approveCandidate(candId, listingId, listingName, email, fullName) {
  if (!confirm(`Approve ${fullName || email} for ${listingName}? This will:\n- Mark them as Matched on the Interest List\n- Decrement units available\n- Log to Successes`)) return

  try {
    // 1. Mark candidate approved
    const { error: e1 } = await sb.from('listing_candidates').update({ status: 'approved' }).eq('id', candId)
    if (e1) throw e1

    // 2. Mark IL applicant as matched + log to status_history
    const ilRow = ilData.find(r => r.email === email)
    const currentHistory = Array.isArray(ilRow?.status_history) ? ilRow.status_history : []
    const approvalEntry = { status: 'matched', prev: ilRow?.status || 'active', ts: new Date().toISOString(), note: 'Approved for ' + listingName }
    const { error: e2 } = await sb.from('interest_list')
      .update({ status: 'matched', updated_at: new Date().toISOString(), status_history: [...currentHistory, approvalEntry] })
      .eq('email', email)
    if (e2) throw e2
    if (ilRow) { ilRow.status = 'matched'; ilRow.status_history = [...currentHistory, approvalEntry] }

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

async function runMatching() {
  const btn = document.getElementById('run-matching-btn')
  if (!btn) return
  btn.disabled = true
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Running...'
  toast('Matching engine started. This may take up to 30 seconds.')
  try {
    const { error } = await sb.functions.invoke('daily-match')
    if (error) { toast('Matching engine error: ' + error.message, true) }
    else { toast('Matching run complete. Refreshing results...') }
    await loadMatches()
  } catch (e) {
    toast('Could not reach the matching engine: ' + (e.message || e), true)
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Run Matching Now'
  }
}

document.getElementById('run-matching-btn').addEventListener('click', runMatching)

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

  const countLine = `${successesData.length} successful match${successesData.length !== 1 ? 'es' : ''} - tap any card to view details`

  // ── Mobile card layout ──
  if (window.innerWidth <= 768) {
    const cards = successesData.map((r, i) => {
      const listing = esc(r.listing_name || r.listing_id || '')
      const notes   = r.final_notes ? esc(r.final_notes).slice(0, 80) + (r.final_notes.length > 80 ? '...' : '') : ''
      return `<div class="sc-mobile-card" onclick="openSuccessModal(${i})">
        <div class="sc-mc-top">
          <span class="sc-mc-name">${esc(r.full_name || 'Unknown')}</span>
          <span class="sc-mc-date">${fmtDate(r.approved_at)}</span>
        </div>
        ${r.email   ? `<div class="sc-mc-email"><i class="fa-solid fa-envelope"></i> ${esc(r.email)}</div>` : ''}
        ${listing   ? `<div class="sc-mc-listing"><i class="fa-solid fa-house"></i> ${listing}</div>` : ''}
        ${notes     ? `<div class="sc-mc-notes">${notes}</div>` : ''}
      </div>`
    }).join('')
    setArea('successes-area', `
      <div style="margin-bottom:.75rem;font-size:.85rem;color:#666;">${countLine}</div>
      <div class="sc-card-list">${cards}</div>`)
    return
  }

  // ── Desktop table layout ──
  const html = `
    <div style="margin-bottom:1rem;font-size:.9rem;color:#666;">${successesData.length} successful match${successesData.length !== 1 ? 'es' : ''} - click any row to view details</div>
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

async function openSuccessModal(idx) {
  viewingSuccessRow = successesData[idx]
  const r = viewingSuccessRow

  // Show modal immediately with a loading state while we resolve IL + listing data
  document.getElementById('success-modal-title').textContent = r.full_name || r.email
  document.getElementById('success-modal-body').innerHTML =
    '<div style="text-align:center;padding:2rem;color:var(--muted);">' +
    '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;"></i>' +
    '<p style="margin-top:.75rem;font-size:.88rem;">Loading details...</p></div>'
  document.getElementById('success-modal-overlay').classList.add('open')

  // Find matching IL record — use cache if warm, otherwise fetch directly from DB
  // (ilData is only populated when the Interest List tab has been visited this session)
  let il = ilData.find(a => a.email === r.email) || null
  if (!il && r.email) {
    const { data } = await sb.from('interest_list').select('*').eq('email', r.email).maybeSingle()
    il = data || {}
  } else {
    il = il || {}
  }

  // Same for listing record
  let lst = lstData.find(l => l.listing_id === r.listing_id) || null
  if (!lst && r.listing_id) {
    const { data } = await sb.from('listings').select('*').eq('listing_id', r.listing_id).maybeSingle()
    lst = data || {}
  } else {
    lst = lst || {}
  }

  // Build pipeline from status_history (admin events) plus known anchors
  const STATUS_COLORS = { new: '#6aab7c', reviewing: '#4a7c6a', active: '#2c7c8a', matched: '#2c5545', expired: '#aaa' }
  const historySteps = (Array.isArray(il.status_history) ? il.status_history : []).map(entry => {
    if (entry.event === 'in_review') {
      return { label: 'In Review - ' + (entry.listing_name || entry.listing_id || 'listing'), date: entry.ts, color: '#7b6fa0' }
    }
    if (entry.status) {
      const label = entry.status.charAt(0).toUpperCase() + entry.status.slice(1)
      return { label: 'Status: ' + label, date: entry.ts, color: STATUS_COLORS[entry.status] || '#888' }
    }
    return null
  }).filter(Boolean)

  const pipelineSteps = [
    { label: 'Form Submitted', date: il.submitted_at || null, color: '#4a7c6a' },
    ...historySteps,
    { label: 'Approved / Matched', date: r.approved_at || null, color: '#2c5545' },
  ].filter(s => s.date).sort((a, b) => new Date(a.date) - new Date(b.date))

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
          <li><strong>Applicants in matching</strong>: people on the Interest List with status New, Reviewing, or Active. These are the applicants the matching engine runs against each day.</li>
          <li><strong>In Matching listings</strong>: listings set to "In Matching." These are the properties the engine compares applicants against.</li>
          <li><strong>Program-linked</strong>: listings that have a site program attached.</li>
          <li><strong>Programs</strong>: total community or developer programs you have set up.</li>
          <li><strong>Property submissions</strong>: seller inquiries submitted through the public contact form.</li>
        </ul>`
      },
      {
        q: 'Why does it sometimes say "Database is waking up"?',
        a: 'The database is on a free-tier plan that goes to sleep after a period of inactivity. The first load after it has been idle can take 20 to 30 seconds. The page will load automatically once the database responds - no action needed.'
      }
    ]
  },

  testimonials: {
    title: 'Testimonials',
    intro: 'Testimonials are quotes from clients, buyers, and partners that appear on the public homepage. Active testimonials are shown automatically - inactive ones are saved but hidden from the site.',
    faq: [
      {
        q: 'How do I add a new testimonial?',
        a: 'Click the <strong>+ Add Testimonial</strong> button in the toolbar. Enter the quote text (required), the person\'s name or attribution, their role or buyer type, and set <strong>Show on Website</strong> to Yes to make it live immediately.'
      },
      {
        q: 'How do I edit or remove a testimonial?',
        a: 'Click any row in the table to open the edit modal. Update the fields and save, or click <strong>Delete</strong> to permanently remove it. You can also use the trash icon on a row to delete without opening the modal.'
      },
      {
        q: 'What is the difference between Active and Inactive?',
        a: '<strong>Active</strong> testimonials are shown on the public homepage. <strong>Inactive</strong> testimonials are saved in the system but hidden from visitors. Toggle the <strong>Show on Website</strong> switch in the edit modal to change the status.'
      },
      {
        q: 'How do the Name and Role fields work?',
        a: 'The <strong>Name</strong> field is the person\'s name or initials. The <strong>Role</strong> field is their buyer type or partner type (for example: First-Time Buyer, Developer Partner). On the website, both are combined as the attribution below the quote. Either or both can be left blank.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>All</strong>: shows every testimonial regardless of status.</li>
          <li><strong>Active</strong> (default): shows only testimonials currently on the website.</li>
          <li><strong>Inactive</strong>: shows only hidden testimonials.</li>
        </ul>`
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
          <li><strong>Non-Promoted</strong> (default): shows submissions not yet pushed to a Listing.</li>
          <li><strong>All</strong>: shows every submission.</li>
          <li><strong>Promoted</strong>: shows submissions that have already been converted to a Listing.</li>
        </ul>`
      },
      {
        q: 'How do I move a submission to a Listing?',
        a: 'Click the <strong>Promote</strong> button in the Actions column of any non-promoted submission. This opens the Add Listing modal pre-filled with the property\'s details so you can review and save it as an active Listing in the matching system. Once promoted, the submission is marked accordingly.'
      },
      {
        q: 'Can I edit a submission after it comes in?',
        a: 'Yes. Click anywhere on the submission row to open the detail modal. You can update the contact info, property details, and status from there.'
      }
    ]
  },

  'org-inquiries': {
    title: 'Org Inquiries',
    intro: 'Org Inquiries are partnership and organization inquiry messages submitted through the contact page. These are builders, nonprofits, housing agencies, and other partners who want to learn more about working with CA Affordable Homes. New inquiries land here unread and are ready for your review.',
    faq: [
      {
        q: 'How does a new inquiry come in?',
        a: 'When someone fills out the organization or developer inquiry form on the contact page and submits, the record is saved immediately to the database and appears here with a <strong>New</strong> status. You will also receive an email notification at the team inbox.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>New</strong> (default): shows only unreviewed inquiries that still need your attention.</li>
          <li><strong>Reviewed</strong>: shows inquiries you have already marked as reviewed.</li>
          <li><strong>All</strong>: shows every inquiry regardless of status.</li>
        </ul>`
      },
      {
        q: 'How do I mark an inquiry as reviewed?',
        a: 'Click the <strong>Mark Reviewed</strong> button on any New inquiry card. The status changes to Reviewed immediately and the card moves out of the New filter. If you need to reopen it, click <strong>Mark as New</strong> to move it back.'
      },
      {
        q: 'How do I reply to an inquiry?',
        a: 'Click the email address link on the inquiry card. Your default email application will open a new message pre-addressed to that contact. If a phone number was provided, click it to initiate a call on devices that support it.'
      },
      {
        q: 'How do I delete an inquiry?',
        a: 'Click the <strong>Delete</strong> button on the inquiry card and confirm the prompt. The record is permanently removed and cannot be recovered.'
      },
      {
        q: 'What information comes in with an inquiry?',
        a: `<ul>
          <li><strong>Organization name</strong> and <strong>contact person name</strong></li>
          <li><strong>Email address</strong> and <strong>phone number</strong> (if provided)</li>
          <li><strong>Area of interest</strong>: the San Diego region(s) the organization is focused on</li>
          <li><strong>Message</strong>: their inquiry description or details</li>
          <li><strong>Submitted date and time</strong></li>
        </ul>`
      }
    ]
  },

  listings: {
    title: 'Listings',
    intro: 'Listings are the internal property records that the matching engine runs against. They are never shown to applicants on the website - all listing data stays inside this admin portal. This tab is where you create, edit, and manage all properties in the system.',
    faq: [
      {
        q: 'What do "In Matching" and "Not Matching" mean?',
        a: '<strong>In Matching</strong> means the listing is active and the daily matching engine will compare all eligible applicants against it. <strong>Not Matching</strong> means the listing is paused and skipped during the matching run. Use the <strong>In Matching</strong> toggle at the top of the Edit modal to switch between them.'
      },
      {
        q: 'Which eligibility fields are actually required for matching?',
        a: 'Only fields where you have entered a value are checked during matching. If a field is left blank, the matching engine skips that check entirely - it does not fail or penalize applicants for it. This means each listing can have its own unique combination of requirements. For example, if one listing does not care about foreclosure history, leave that field empty and it will not affect scores. If another listing requires a minimum credit score of 680, enter that value and the engine will enforce it for that listing only.'
      },
      {
        q: 'What does "Program-Linked" mean?',
        a: 'A listing is program-linked when it has a site program attached to it. This link is for your own tracking and organization only - it does not affect matching in any way. Matching runs on the eligibility fields you fill in, regardless of whether a program is linked.'
      },
      {
        q: 'How do I add a new listing?',
        a: 'Click the <strong>+ Add Listing</strong> button in the toolbar at the top of the tab. Fill in the property details in the modal that appears and click Save.'
      },
      {
        q: 'How do I link a listing to a program?',
        a: 'Open the Edit modal for a listing. At the very top is a <strong>Site Program</strong> dropdown. Select the program from the list. Linking is optional and is only for tracking purposes - it does not affect how the matching engine works. If the program does not exist yet, click <strong>+ New Program</strong> to create one.'
      },
      {
        q: 'How do I delete a listing?',
        a: 'Click the <strong>trash icon</strong> on a listing card. You will be asked to confirm before it is permanently deleted. Once deleted, the listing is removed from the matching engine immediately.'
      },
      {
        q: 'What do the filter buttons do?',
        a: `<ul>
          <li><strong>In Matching</strong> (default): shows only active listings.</li>
          <li><strong>All</strong>: shows every listing regardless of status.</li>
          <li><strong>Not Matching</strong>: shows only paused listings.</li>
          <li><strong>Program-Linked</strong>: shows only listings attached to a site program.</li>
          <li><strong>Non Program-Linked</strong>: shows only listings not yet attached to any program.</li>
        </ul>`
      }
    ]
  },

  programs: {
    title: 'Programs',
    intro: 'Programs represent community developments, builder partnerships, or other housing initiatives. They appear on the public-facing website as program cards - they are the only real estate content here that is shown to visitors on the site.',
    faq: [
      {
        q: 'What is the difference between a Program and a Listing?',
        a: '<strong>Listings</strong> are individual properties used internally by the matching engine. They are never shown to applicants or visitors. <strong>Programs</strong> are community developments or developer partnerships that appear on the public website. Programs are safe, general-purpose marketing content - they do not expose any specific property address, price, or listing detail.'
      },
      {
        q: 'Do I need to link a Listing to a Program for matching to work?',
        a: 'No. Matching runs automatically based on the eligibility fields you fill in on a listing. Linking a listing to a program is optional and only affects your internal organization and tracking - it has no effect on who gets matched.'
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
          <li><strong>Active</strong> (default): shows only publicly visible programs.</li>
          <li><strong>All</strong>: shows every program.</li>
          <li><strong>Inactive</strong>: shows only hidden programs.</li>
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
          <li><strong>New</strong>: submitted the form and has not been reviewed yet. Included in daily matching.</li>
          <li><strong>Reviewing</strong>: you are actively evaluating this applicant. Included in daily matching.</li>
          <li><strong>Active</strong>: qualified and actively waiting for a match. Included in daily matching. Subject to 12-month automatic expiry.</li>
          <li><strong>Matched</strong>: successfully placed in a home. Excluded from matching.</li>
          <li><strong>Expired</strong>: 12 months have passed without a match. Excluded from matching. If they re-submit the form, they are automatically re-enrolled.</li>
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
    intro: 'The Matches tab shows the results of the matching engine. For each active listing, you can see which applicants passed all requirements and which came close. Fail results are not displayed - only Pass and Close candidates are shown here for your review.',
    faq: [
      {
        q: 'How does the matching engine work?',
        a: 'The engine compares every applicant with status New, Reviewing, or Active against every In Matching listing. For each listing, only the fields you have filled in are checked - if a field is blank on a listing, it is skipped entirely for that listing. This means each listing enforces only the requirements you have entered for it. Results are saved to the database and this tab is refreshed after each run.'
      },
      {
        q: 'What do Pass and Close mean?',
        a: `<ul>
          <li><strong>Pass</strong>: the applicant meets all requirements you have entered for this listing. These are your top candidates to contact.</li>
          <li><strong>Close</strong>: the applicant failed 1 or 2 of the checks for this listing. They may still be worth reaching out to depending on the situation.</li>
        </ul>
        Applicants who fail 3 or more checks are excluded from this view entirely.`
      },
      {
        q: 'What is the star icon next to a candidate?',
        a: 'The star marks the <strong>top-ranked</strong> Pass or Close candidate for a listing. Ranking is first come, first served based on submission date. The star moves to the next eligible person if the top-ranked candidate opts out or is moved to Matched status.'
      },
      {
        q: 'What does "Opt Out" do?',
        a: 'Clicking <strong>Opt Out</strong> records that this applicant has decided they are not interested in this specific property. They remain on the Interest List and stay eligible for other listings. Their place in line for other listings is unaffected. The star moves to the next eligible person for this listing. Opt Out is available at any stage - including while In Review.'
      },
      {
        q: 'What does "Opt Back In" do?',
        a: 'If an applicant opted out of a listing but changes their mind, clicking <strong>Opt Back In</strong> restores them to their original position in line for that listing. Their rank is based on their original submission date.'
      },
      {
        q: 'How do I approve a match and log a success?',
        a: 'First click <strong>Start Review</strong> on the candidate. This marks them as In Review - a signal that you are actively working with them on this listing. Once you are ready to confirm the placement, click <strong>Approve</strong>. This sets the applicant\'s status to Matched (removing them from future matching runs) and logs the placement in the Successes tab. The Approve button only appears after Start Review has been clicked.'
      },
      {
        q: 'Can I run the matching engine manually?',
        a: 'Yes. Click the <strong>Run Matching Now</strong> button at the top left of this tab. The engine will run immediately and results will refresh automatically when it completes. The engine also runs automatically every morning.'
      },
      {
        q: 'Why does a listing show no candidates?',
        a: 'Either no applicants have passed or come close to the requirements for that listing, or the matching engine has not run yet. You can trigger a run manually using the <strong>Run Matching Now</strong> button.'
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
          <li><strong>Pipeline Timeline</strong>: a chronological log showing when the applicant submitted, every status change made in the admin, and when they were approved.</li>
          <li><strong>Applicant section</strong>: key info from their Interest List record, including any notes they submitted.</li>
          <li><strong>Property section</strong>: details about the listing they were matched to.</li>
          <li><strong>Final Notes</strong>: a text field where you can record the outcome, any follow-up needed, or other closing context.</li>
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

// =============================================================
// MOBILE NAV
// =============================================================

function openMobileNav() {
  document.querySelector('.admin-sidebar').classList.add('mobile-open')
  document.getElementById('sidebar-overlay').classList.add('active')
  document.body.style.overflow = 'hidden'
}

function closeMobileNav() {
  document.querySelector('.admin-sidebar').classList.remove('mobile-open')
  document.getElementById('sidebar-overlay').classList.remove('active')
  document.body.style.overflow = ''
}

document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  if (document.querySelector('.admin-sidebar').classList.contains('mobile-open')) {
    closeMobileNav()
  } else {
    openMobileNav()
  }
})
document.getElementById('sidebar-close-btn').addEventListener('click', closeMobileNav)
document.getElementById('sidebar-overlay').addEventListener('click', closeMobileNav)

// Close sidebar after selecting a tab on mobile
document.querySelectorAll('.sb-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeMobileNav()
  })
})

// Mobile footer bar actions
document.getElementById('mf-help-btn').addEventListener('click', openHelp)
document.getElementById('mf-refresh-btn').addEventListener('click', refreshCurrentTab)
document.getElementById('mf-signout-btn').addEventListener('click', () => sb.auth.signOut())

// =============================================================
// DYNAMIC VIEWPORT RESIZE
// Re-renders the active tab when crossing the mobile breakpoint
// so toggling DevTools responsive mode (or rotating a phone)
// switches between card and table layouts without a page reload.
// =============================================================

const MOBILE_BP = 768
let lastIsMobile = window.innerWidth <= MOBILE_BP
let resizeBreakpointTimer = null

window.addEventListener('resize', () => {
  clearTimeout(resizeBreakpointTimer)
  resizeBreakpointTimer = setTimeout(() => {
    const isMobile = window.innerWidth <= MOBILE_BP
    if (isMobile === lastIsMobile) return   // no breakpoint crossing — nothing to do
    lastIsMobile = isMobile

    const tab = document.querySelector('.sb-btn.active[data-tab]')?.dataset.tab
    if (!tab) return

    // Interest list: renderIL() reads all state from globals — just call it
    if (tab === 'interest-list' && ilData.length) {
      renderIL()
      return
    }

    // Matches: re-render with stored args, preserving which blocks are expanded
    if (tab === 'matches' && matchRenderData) {
      const openBlocks = new Set(
        Array.from(document.querySelectorAll('[id^="match-body-"]'))
          .filter(el => el.style.display !== 'none')
          .map(el => el.id.replace('match-body-', ''))
      )
      renderMatches(
        matchRenderData.listings,
        matchRenderData.results,
        matchRenderData.cands,
        matchRenderData.il,
        openBlocks
      )
      return
    }

    // Property Submissions: renderPS() reads all state from globals — just call it
    if (tab === 'property-submissions' && psData.length) {
      renderPS()
      return
    }

    // Successes: renderSuccesses() reads all state from globals — just call it
    if (tab === 'successes' && successesData.length) {
      renderSuccesses()
    }
  }, 150)  // 150ms debounce — smooth during drag, snappy at rest
})
