// =============================================================
// CA Affordable Homes — Admin JS
// Supabase-backed admin portal. No Apps Script required.
// =============================================================

const SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'
const SUBMIT_FN    = `${SUPABASE_URL}/functions/v1/submit-interest`

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ── State ─────────────────────────────────────────────────────
let lstData = [], progData = [], ilData = [], psData = [], candidatesData = [], successesData = []
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
    loadActiveTab()
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('login-btn')
  const errEl = document.getElementById('login-error')
  errEl.style.display = 'none'
  btn.disabled = true
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...'

  const { error } = await sb.auth.signInWithPassword({
    email:    document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-password').value,
  })

  btn.disabled = false
  btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In'

  if (error) {
    errEl.textContent = error.message
    errEl.style.display = 'block'
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
}

function loadActiveTab(tab) {
  tab = tab || location.hash.replace('#','') || 'dashboard'
  if (tab === 'dashboard')     loadDashboard()
  if (tab === 'properties')    { if (!psData.length)   loadPS()           }
  if (tab === 'listings')      { if (!lstData.length)  loadListings()     }
  if (tab === 'programs')      { if (!progData.length) loadPrograms()     }
  if (tab === 'interest-list') { if (!ilData.length)   loadInterestList() }
  if (tab === 'matches')       loadMatches()
  if (tab === 'successes')     loadSuccesses()
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  const tab = document.querySelector('.sb-btn.active[data-tab]')?.dataset.tab || 'dashboard'
  lstData = []; progData = []; ilData = []; psData = []; candidatesData = []; successesData = []
  loadActiveTab(tab)
})

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  setArea('dashboard-area', loading())
  try {
    const [
      { count: ilTotal },
      { data: ilByStatus },
      { count: lstTotal },
      { data: lstRows },
      { count: progTotal },
      { data: progRows },
      { count: psTotal },
      { data: psByStatus },
    ] = await Promise.all([
      sb.from('interest_list').select('*', { count: 'exact', head: true }),
      sb.from('interest_list').select('status'),
      sb.from('listings').select('*', { count: 'exact', head: true }),
      sb.from('listings').select('active,linked_program_id'),
      sb.from('programs').select('*', { count: 'exact', head: true }),
      sb.from('programs').select('status'),
      sb.from('property_submissions').select('*', { count: 'exact', head: true }),
      sb.from('property_submissions').select('status'),
    ])

    const ilCounts = countBy(ilByStatus || [], 'status')
    const psCounts  = countBy(psByStatus  || [], 'status')
    const lstActive = (lstRows || []).filter(r => r.active === 'YES').length
    const lstOnSite = (lstRows || []).filter(r => r.linked_program_id).length
    const progAvail = (progRows || []).filter(r => r.status === 'Available').length
    const progSoon  = (progRows || []).filter(r => r.status === 'Coming Soon').length
    const psPromoted = psCounts['promoted'] || 0

    setArea('dashboard-area', `
      <div class="dash-pipeline-wrap">
        <div class="pipeline-stage" data-nav="properties">
          <div class="pipeline-icon"><i class="fa-solid fa-inbox"></i></div>
          <div class="pipeline-label">Submissions</div>
          <div class="pipeline-nums"><span class="pipeline-highlight">${(psTotal||0) - psPromoted}</span> pending</div>
          <div class="pipeline-nums">${psTotal||0} total &bull; ${psPromoted} promoted</div>
        </div>
        <div class="pipeline-arrow"><i class="fa-solid fa-chevron-right"></i></div>
        <div class="pipeline-stage" data-nav="listings">
          <div class="pipeline-icon"><i class="fa-solid fa-building"></i></div>
          <div class="pipeline-label">Listings</div>
          <div class="pipeline-nums"><span class="pipeline-highlight">${lstActive}</span> active</div>
          <div class="pipeline-nums">${lstTotal||0} total &bull; ${lstOnSite} on site</div>
        </div>
        <div class="pipeline-arrow"><i class="fa-solid fa-chevron-right"></i></div>
        <div class="pipeline-stage" data-nav="programs">
          <div class="pipeline-icon"><i class="fa-solid fa-globe"></i></div>
          <div class="pipeline-label">Programs</div>
          <div class="pipeline-nums"><span class="pipeline-highlight">${progAvail}</span> available</div>
          <div class="pipeline-nums">${progTotal||0} total &bull; ${progSoon} coming soon</div>
        </div>
      </div>
      <div class="dash-bottom">
        <div class="dash-stat-card" data-nav="interest-list">
          <div class="dash-stat-num">${ilTotal||0}</div>
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
  } catch (err) {
    setArea('dashboard-area', `<div class="error-state"><p>Error: ${esc(err.message)}</p></div>`)
  }
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
  if (psFilter !== 'all') rows = psData.filter(r => (r.status||'new') === psFilter)
  if (!rows.length) { setArea('ps-area', emptyState('No submissions match this filter.')); return }

  rows = sortRows(rows, psSort)

  const psCols = [
    { label: 'Date',    col: 'submitted_at' },
    { label: 'Contact', col: 'contact_name' },
    { label: 'Address', col: 'prop_address' },
    { label: 'AMI',     col: 'ami_percent' },
    { label: 'Status',  col: 'status' },
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
      ${rows.map(r => `<tr>
        <td>${fmtDate(r.submitted_at)}</td>
        <td><strong>${esc(r.contact_name||'')}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.contact_email||'')}</span></td>
        <td>${esc(r.prop_address||'')}</td>
        <td>${esc(r.ami_percent ? r.ami_percent+'%' : '')}</td>
        <td><span class="status-pill ${pillCls(r.status||'new')}">${esc(r.status||'new')}</span></td>
        <td class="action-cell">
          <button class="btn-secondary btn-xs" onclick="openPSModal(${psData.indexOf(r)})"><i class="fa-solid fa-pen"></i></button>
          ${(r.status||'new') !== 'promoted' ? `<button class="btn-primary btn-xs" onclick="promoteToListing(${psData.indexOf(r)})"><i class="fa-solid fa-arrow-up-right-from-square"></i> Promote</button>` : `<span style="font-size:.75rem;color:#888;">Promoted</span>`}
        </td>
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
document.getElementById('lst-drawer-close').addEventListener('click', closeLSTDrawer)
document.getElementById('lst-drawer-overlay').addEventListener('click', closeLSTDrawer)
document.getElementById('lst-cancel-btn').addEventListener('click', closeLSTModal)
document.getElementById('lst-modal-close').addEventListener('click', closeLSTModal)

async function loadListings() {
  setArea('lst-area', loading())
  const fetches = [sb.from('listings').select('*').order('created_at', { ascending: false })]
  if (!progData.length) fetches.push(sb.from('programs').select('*').order('created_at', { ascending: false }))
  const [lstRes, progRes] = await Promise.all(fetches)
  if (lstRes.error) { setArea('lst-area', errorState(lstRes.error)); return }
  lstData = lstRes.data || []
  if (progRes && !progRes.error) progData = progRes.data || []
  renderListings()
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
          <span class="status-pill ${r.active === 'YES' ? 'pill-active' : 'pill-expired'}" style="flex-shrink:0;">${r.active === 'YES' ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="prog-card-body">
          ${r.ami_percent ? `<div class="prog-detail"><span class="prog-detail-label">AMI</span><span class="prog-detail-value">${esc(r.ami_percent)}%</span></div>` : ''}
          ${r.price ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-tag" style="width:14px;color:#888;margin-right:.3rem;"></i>Price</span><span class="prog-detail-value">$${esc(r.price)}</span></div>` : ''}
          ${r.bedrooms ? `<div class="prog-detail"><span class="prog-detail-label"><i class="fa-solid fa-bed" style="width:14px;color:#888;margin-right:.3rem;"></i>Beds</span><span class="prog-detail-value">${esc(r.bedrooms)}</span></div>` : ''}
          ${progBadge}
        </div>
        <div class="prog-card-footer">
          <button class="btn-secondary btn-sm" onclick="openLSTDrawer(${idx})"><i class="fa-solid fa-circle-info"></i> Details</button>
          <button class="btn-secondary btn-sm" onclick="openLSTModal(${idx})"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteListing(${idx})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  </div>`
  setArea('lst-area', html)
}

// ── Listing Drawer ────────────────────────────────────────────
function openLSTDrawer(idx) {
  const r = lstData[idx]
  document.getElementById('lst-drawer-title').textContent = r.listing_name || r.listing_id || 'Listing Details'

  // Site program section
  let linkedProgIdx = -1
  const currentLink = r.linked_program_id || ''
  let progOpts = '<option value="-1">-- Select a program --</option>'
  if (progData.length) {
    progData.forEach((p, pi) => {
      const selected = currentLink && p.community_name === currentLink
      if (selected) linkedProgIdx = pi
      progOpts += `<option value="${pi}"${selected ? ' selected' : ''}>${esc(p.community_name || 'Program ' + pi)}</option>`
    })
  }

  // Linked listings for this program (shown in program card too)
  const linkedListings = lstData.filter(l => l.linked_program_id && l.linked_program_id === currentLink && l.listing_id !== r.listing_id)

  const siteSection = `<div class="drawer-action-row">
    <div class="drawer-action-title"><i class="fa-solid fa-globe"></i> Site Program</div>
    ${currentLink
      ? `<div style="font-size:.84rem;color:#2c5545;margin-bottom:.55rem;"><i class="fa-solid fa-circle-check" style="margin-right:.35rem;"></i>Linked to: <strong>${esc(currentLink)}</strong></div>`
      : `<div style="font-size:.82rem;color:#999;margin-bottom:.55rem;">Not linked to any site program</div>`}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
      <select id="lst-prog-select" class="form-input" style="flex:1;min-width:160px;">${progOpts}</select>
      <button class="btn-primary btn-sm" id="lst-link-btn"><i class="fa-solid fa-link"></i> Link</button>
      ${linkedProgIdx >= 0 ? `<button class="btn-secondary btn-sm" id="lst-unlink-btn"><i class="fa-solid fa-unlink"></i> Unlink</button>` : ''}
      <button class="btn-secondary btn-sm" id="lst-push-new-btn"><i class="fa-solid fa-plus"></i> New Program</button>
    </div>
  </div>`

  // Fields display
  const sections = [
    { title: 'Eligibility', fields: [
      ['Units Available', r.units_available !== null && r.units_available !== undefined ? String(r.units_available) : ''],
      ['AMI %', r.ami_percent], ['Min Credit Score', r.min_credit_score],
      ['Max DTI %', r.max_dti_percent], ['Max Monthly Debt', r.max_monthly_debt ? '$'+r.max_monthly_debt : ''],
      ['Min Household', r.min_household_size], ['Max Household', r.max_household_size],
      ['First-Time Buyer', r.first_time_buyer_required], ['SD County Residency', r.sd_county_residency_required],
    ]},
    { title: 'Income Limits', fields: [
      ['1 Person', r.max_income_1person ? '$'+r.max_income_1person : ''],
      ['4 Person', r.max_income_4person ? '$'+r.max_income_4person : ''],
      ['6 Person', r.max_income_6person ? '$'+r.max_income_6person : ''],
    ]},
    { title: 'Program Notes', fields: [['', r.program_notes]] },
  ]

  let fieldsHtml = sections.map(sec => {
    const rows = sec.fields.filter(([,v]) => v).map(([label, val]) =>
      `<div class="field-row">
        ${label ? `<span class="field-label">${esc(label)}</span>` : ''}
        <span class="field-value">${esc(String(val))}</span>
      </div>`
    ).join('')
    if (!rows) return ''
    return `<div class="field-group"><div class="field-group-title">${esc(sec.title)}</div>${rows}</div>`
  }).join('')

  const activeSection = `<div>
    <div class="field-group-title" style="border-radius:8px 8px 0 0;border:1px solid #f0f0eb;border-bottom:none;padding:.5rem .85rem;">Active for Matching</div>
    <div style="border:1px solid #f0f0eb;border-radius:0 0 8px 8px;padding:.85rem;">
      <div class="status-editor">
        <select id="lst-active-select">
          <option value="YES"${r.active === 'YES' ? ' selected' : ''}>YES - include in daily matching</option>
          <option value="NO"${r.active !== 'YES' ? ' selected' : ''}>NO - exclude from matching</option>
        </select>
        <button class="btn-primary btn-sm" id="lst-active-save-btn"><i class="fa-solid fa-check"></i> Save</button>
      </div>
      <textarea class="notes-area" id="lst-note-input" placeholder="Add or edit internal notes...">${esc(r.internal_notes || '')}</textarea>
      <button class="btn-secondary btn-sm" id="lst-notes-save-btn" style="margin-top:.5rem;"><i class="fa-solid fa-floppy-disk"></i> Save Notes</button>
    </div>
  </div>`

  document.getElementById('lst-drawer-body').innerHTML = siteSection + activeSection + fieldsHtml

  // Wire buttons
  document.getElementById('lst-link-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('lst-prog-select')
    const pi = parseInt(sel.value, 10)
    if (isNaN(pi) || pi < 0) { toast('Select a program first.', true); return }
    const prog = progData[pi]
    const { error } = await sb.from('listings').update({ linked_program_id: prog.community_name }).eq('id', r.id)
    if (error) { toast(error.message, true); return }
    r.linked_program_id = prog.community_name
    toast('Linked to program.')
    renderListings()
    openLSTDrawer(idx)
  })

  document.getElementById('lst-unlink-btn')?.addEventListener('click', async () => {
    if (!confirm('Remove this listing from its site program?')) return
    const { error } = await sb.from('listings').update({ linked_program_id: null }).eq('id', r.id)
    if (error) { toast(error.message, true); return }
    r.linked_program_id = null
    toast('Unlinked.')
    renderListings()
    openLSTDrawer(idx)
  })

  document.getElementById('lst-push-new-btn')?.addEventListener('click', () => {
    switchTab('programs')
    openProgModal(null, {
      community_name: r.listing_name || r.listing_id || '',
      area:           r.city || '',
      program_type:   r.program_type || '',
      ami_range:      r.ami_percent ? r.ami_percent + '% AMI' : '',
      bedrooms:       r.bedrooms || '',
      household_size_limit: r.max_household_size ? (r.min_household_size && r.min_household_size !== r.max_household_size ? `${r.min_household_size}-${r.max_household_size}` : r.max_household_size) : '',
      first_time_buyer: r.first_time_buyer_required === 'YES' ? 'Required' : r.first_time_buyer_required === 'NO' ? 'Not Required' : '',
      price_range:    r.price || '',
      status:         'Available',
      notes:          r.program_notes || '',
      source_listing_id: r.listing_id || '',
    })
  })

  document.getElementById('lst-active-save-btn')?.addEventListener('click', async () => {
    const val = document.getElementById('lst-active-select').value
    const { error } = await sb.from('listings').update({ active: val }).eq('id', r.id)
    if (error) { toast(error.message, true); return }
    r.active = val
    toast('Active status saved.')
    renderListings()
  })

  document.getElementById('lst-notes-save-btn')?.addEventListener('click', async () => {
    const notes = document.getElementById('lst-note-input').value
    const { error } = await sb.from('listings').update({ internal_notes: notes }).eq('id', r.id)
    if (error) { toast(error.message, true); return }
    r.internal_notes = notes
    toast('Notes saved.')
  })

  document.getElementById('lst-drawer').setAttribute('aria-hidden', 'false')
  document.getElementById('lst-drawer-overlay').classList.add('active')
}

function closeLSTDrawer() {
  document.getElementById('lst-drawer').setAttribute('aria-hidden', 'true')
  document.getElementById('lst-drawer-overlay').classList.remove('active')
}

// ── Listing Modal ─────────────────────────────────────────────
function openLSTModal(idx, prefill) {
  editingLstRow = idx !== null && idx !== undefined ? lstData[idx] : null
  const p = editingLstRow || prefill || {}
  document.getElementById('lst-modal-title').textContent = editingLstRow ? 'Edit Listing' : (promotingPsId ? 'Promote to Listing' : 'Add Listing')
  document.getElementById('lf-id').value          = p.listing_id || ''
  document.getElementById('lf-name').value        = p.listing_name || ''
  document.getElementById('lf-active').value      = p.active || 'NO'
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
  document.getElementById('lf-linked-prog').value = p.linked_program_id || ''
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
    active:       document.getElementById('lf-active').value,
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
  const fetches = [sb.from('programs').select('*').order('created_at', { ascending: false })]
  if (!lstData.length) fetches.push(sb.from('listings').select('*').order('created_at', { ascending: false }))
  const [progRes, lstRes] = await Promise.all(fetches)
  if (progRes.error) { setArea('prog-area', errorState(progRes.error)); return }
  progData = progRes.data || []
  if (lstRes && !lstRes.error) lstData = lstRes.data || []
  renderPrograms()
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
    { label: '',               col: null },
  ]

  const html = `<table class="data-table">
    <thead><tr>
      ${ilCols.map(c => c.col
        ? `<th class="sortable${ilSort.col === c.col ? ' sort-active' : ''}" data-sort-il="${c.col}">${c.label} ${sortArrow(ilSort, c.col)}</th>`
        : `<th></th>`
      ).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td><strong>${esc(r.full_name || '')}</strong></td>
        <td>${esc(r.email || '')}</td>
        <td>${esc(r.phone || '')}</td>
        <td>${fmtDate(r.submitted_at)}</td>
        <td><span class="status-pill ${ilPillCls(r.status)}">${esc(r.status || '')}</span></td>
        <td style="font-size:.78rem;color:#666;max-width:200px;white-space:normal;">${esc((r.area_preference || '').substring(0, 80))}</td>
        <td><button class="btn-secondary btn-xs" onclick="openILModal(${ilData.indexOf(r)})"><i class="fa-solid fa-eye"></i></button></td>
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

function openILModal(idx) {
  viewingIlRow = ilData[idx]
  const r = viewingIlRow
  document.getElementById('il-modal-title').textContent = r.full_name || r.email

  const fields = [
    ['Email', r.email], ['Phone', r.phone], ['Submitted', fmtDate(r.submitted_at)],
    ['Status', r.status], ['Area Preference', r.area_preference],
    ['Household Size', r.household_size], ['Credit Score (Self)', r.credit_score_self],
    ['Credit Score (Co)', r.credit_score_coborrower], ['Monthly Debt', r.monthly_debt_payments ? '$'+r.monthly_debt_payments : ''],
    ['Monthly Rent', r.monthly_rent], ['Owned Real Estate', r.owned_real_estate],
    ['SD County Resident', r.live_in_sd_county], ['SD 2yr Residency/Work', r.worked_lived_sd_2yr],
    ['Lived Together 12mo', r.lived_together_12mo], ['SDHC Prior Purchase', r.sdhc_prior_purchase],
    ['US Citizen', r.us_citizen], ['Permanent Resident', r.permanent_resident],
    ['Foreclosure', r.foreclosure], ['Bankruptcy', r.bankruptcy],
    ['Judgments', r.judgments],
    ['Assets (Checking)', r.asset_checking ? '$'+r.asset_checking : ''],
    ['Assets (Savings)', r.asset_savings ? '$'+r.asset_savings : ''],
    ['Assets (401k)', r.asset_401k ? '$'+r.asset_401k : ''],
    ['Assets (Other)', r.asset_other ? '$'+r.asset_other : ''],
  ]

  // Income members
  const incomeRows = [1,2,3,4,5,6].map(n => {
    const nm = r[`income_${n}_name`]
    const amt = r[`income_${n}_annual`]
    if (!nm && !amt) return ''
    return `<tr><td style="padding:3px 8px;">${esc(nm||'')}</td><td style="padding:3px 8px;">${esc(r[`income_${n}_relationship`]||'')}</td><td style="padding:3px 8px;">${esc(amt ? '$'+amt : '')}</td></tr>`
  }).filter(Boolean).join('')

  document.getElementById('il-modal-body').innerHTML = `
    <div class="field-group">
      <div class="field-group-title">Personal Info</div>
      ${fields.filter(([,v]) => v).map(([l, v]) => `
        <div class="field-row">
          <span class="field-label">${esc(l)}</span>
          <span class="field-value">${esc(String(v))}</span>
        </div>`).join('')}
    </div>
    ${incomeRows ? `
    <div class="field-group">
      <div class="field-group-title">Income Members</div>
      <table style="font-size:.82rem;width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f5f5f0;"><th style="padding:3px 8px;text-align:left;">Name</th><th style="padding:3px 8px;text-align:left;">Relationship</th><th style="padding:3px 8px;text-align:left;">Annual</th></tr></thead>
        <tbody>${incomeRows}</tbody>
      </table>
    </div>` : ''}
    ${r.additional_info ? `<div class="field-group"><div class="field-group-title">Additional Info</div><p style="font-size:.85rem;white-space:pre-wrap;">${esc(r.additional_info)}</p></div>` : ''}`

  document.getElementById('il-status-select').value = r.status || 'new'
  document.getElementById('il-modal-overlay').classList.add('open')
}

function closeILModal() {
  document.getElementById('il-modal-overlay').classList.remove('open')
  viewingIlRow = null
}

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
  return '<div class="loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading...</p></div>'
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
    renderMatches(listings || [], results || [], cands || [], il || [])
  } catch(e) {
    setArea('matches-area', errorState(e))
  }
}

function renderMatches(listings, results, cands, il) {
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

    // Merge pass+close, sort by IL submitted_at ascending (earliest = highest priority)
    const allCandidates = [...passRows, ...closeRows].map(r => ({
      ...r,
      ilRow: ilByEmail[r.email] || null,
      cand:  candMap[candKey(lst.listing_id, r.email)] || null,
    })).sort((a, b) => {
      const da = a.ilRow?.submitted_at || a.email
      const db = b.ilRow?.submitted_at || b.email
      return da < db ? -1 : da > db ? 1 : 0
    })

    if (!allCandidates.length) return ''

    const unitsHtml = lst.units_available !== null && lst.units_available !== undefined
      ? `<span class="units-badge">${lst.units_available} unit${lst.units_available !== 1 ? 's' : ''} left</span>`
      : ''

    const rows = allCandidates.map((item, i) => {
      const r   = item
      const il  = item.ilRow
      const cnd = item.cand
      const rank = i + 1
      const isPass  = r.status === 'Pass'
      const statusBadge = isPass
        ? '<span class="match-badge match-pass">Pass</span>'
        : '<span class="match-badge match-close">Close</span>'

      let actionHtml
      if (!cnd) {
        actionHtml = `<button class="btn-primary btn-xs" onclick="startReview('${esc(lst.listing_id)}','${esc(r.email)}')"><i class="fa-solid fa-magnifying-glass"></i> Start Review</button>`
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

      const failDetail = r.failed_fields
        ? `<div style="font-size:.72rem;color:#999;margin-top:.2rem;">${esc(r.failed_fields)}</div>` : ''

      return `<tr class="${isPass ? 'match-row-pass' : 'match-row-close'}${rank === 1 && !cnd ? ' match-priority' : ''}">
        <td class="match-rank">#${rank}${rank === 1 ? ' <span class="priority-star" title="Next in line">★</span>' : ''}</td>
        <td><strong>${esc(r.full_name || r.email)}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.email)}</span></td>
        <td>${il ? fmtDate(il.submitted_at) : ''}</td>
        <td>${il ? (il.credit_score_self || '') : ''}</td>
        <td>${il ? (il.household_size || '') : ''}</td>
        <td>${statusBadge}${failDetail}</td>
        <td class="action-cell">${actionHtml}</td>
      </tr>`
    }).join('')

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
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`
  }).filter(Boolean).join('')

  setArea('matches-area', html || emptyState('No Pass or Close matches found for active listings. Run the match engine to populate results.'))
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
    <div style="margin-bottom:1rem;font-size:.9rem;color:#666;">${successesData.length} successful match${successesData.length !== 1 ? 'es' : ''}</div>
    <table class="data-table">
      <thead><tr>
        <th>Date</th>
        <th>Family</th>
        <th>Listing</th>
        <th>Notes</th>
      </tr></thead>
      <tbody>
        ${successesData.map(r => `<tr>
          <td>${fmtDate(r.approved_at)}</td>
          <td><strong>${esc(r.full_name || '')}</strong><br><span style="font-size:.78rem;color:#888;">${esc(r.email || '')}</span></td>
          <td>${esc(r.listing_name || r.listing_id || '')}</td>
          <td style="font-size:.82rem;color:#666;">${esc(r.notes || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`
  setArea('successes-area', html)
}
