// weekly-match Edge Function (formerly daily-match - keep function name for deploy compatibility)
// Runs the matching engine: evaluates all active applicants against all active listings
// Writes results to match_results table, sends weekly digest email to team every Monday
// Triggered by GitHub Actions cron at 6 AM PST every Monday

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const NOTIFY_EMAIL   = Deno.env.get('NOTIFY_EMAIL') ?? 'tj@nostos.tech'
const FROM_EMAIL     = 'onboarding@resend.dev' // switch to noreply@caaffordablehomes.com after domain verified
const FROM_NAME      = 'CA Affordable Homes Team'
const CLOSE_THRESHOLD = 2

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Load active listings
    const { data: listings, error: lstErr } = await supabase
      .from('listings')
      .select('*')
      .eq('active', 'YES')
    if (lstErr) throw lstErr

    // Load programs to get ami_percent per listing (keyed by community_name)
    const { data: programs } = await supabase
      .from('programs')
      .select('community_name, ami_percent')
    const progAmiMap: Record<string, number | null> = {}
    if (programs) {
      programs.forEach((p: Record<string, unknown>) => {
        if (p.community_name) progAmiMap[String(p.community_name)] = parseNum(p.ami_percent, null)
      })
    }

    // Load eligible applicants (for matching)
    const { data: applicants, error: apErr } = await supabase
      .from('interest_list')
      .select('*')
      .in('status', ['new', 'reviewing', 'active'])
    if (apErr) throw apErr

    // Pipeline stats (run in parallel, fail gracefully)
    const [ilAllRes, ilNewRes, psNewRes, successesRes] = await Promise.all([
      supabase.from('interest_list').select('status'),
      supabase.from('interest_list').select('id').gte('submitted_at', weekAgo),
      supabase.from('property_submissions').select('id').gte('created_at', weekAgo),
      supabase.from('successes').select('*', { count: 'exact', head: true }),
    ])

    // Count applicants by status
    const statusCounts: Record<string, number> = {}
    if (ilAllRes.data) {
      for (const row of ilAllRes.data) {
        statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
      }
    }
    const newApplicantsThisWeek = ilNewRes.data?.length ?? 0
    const newSubmissionsThisWeek = psNewRes.data?.length ?? 0
    const totalSuccesses = successesRes.count ?? 0
    const activeListingsCount = listings?.length ?? 0

    // Run matching engine
    const results: Array<{
      listing_id: string; email: string; full_name: string; status: string; failed_fields: string
    }> = []

    if (listings && listings.length > 0 && applicants && applicants.length > 0) {
      for (const listing of listings) {
        const amiPct = listing.linked_program_id ? (progAmiMap[listing.linked_program_id] ?? null) : null
        for (const ap of applicants) {
          const { status, failedFields } = evaluateApplicant(ap, listing, amiPct)
          results.push({
            listing_id:    listing.listing_id,
            email:         ap.email,
            full_name:     ap.full_name || ap.email,
            status,
            failed_fields: failedFields.join(' | '),
          })
        }
      }

      if (results.length > 0) {
        const { error: upsertErr } = await supabase
          .from('match_results')
          .upsert(results, { onConflict: 'listing_id,email' })
        if (upsertErr) throw upsertErr
      }
    }

    const passCount  = results.filter(r => r.status === 'Pass').length
    const closeCount = results.filter(r => r.status === 'Close').length

    // Always send weekly digest (even when no matches - it's a status check-in)
    await sendWeeklyDigest({
      results,
      listings: listings ?? [],
      passCount,
      closeCount,
      statusCounts,
      newApplicantsThisWeek,
      newSubmissionsThisWeek,
      totalSuccesses,
      activeListingsCount,
    })

    return new Response(JSON.stringify({
      ok: true,
      listings: activeListingsCount,
      applicants: applicants?.length ?? 0,
      results: results.length,
      pass: passCount,
      close: closeCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('daily-match error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// ── Matching Engine ────────────────────────────────────────────

function evaluateApplicant(ap: Record<string, unknown>, req: Record<string, unknown>, amiPct: number | null) {
  const failed: string[] = []

  // Helper: only true when a YES/NO field is explicitly set to YES.
  // Empty/null/missing fields return false so the check is skipped entirely.
  function isExplicitYes(v: unknown): boolean {
    const s = String(v ?? '').trim().toLowerCase()
    return s === 'yes' || s === 'true' || s === '1'
  }
  function isExplicitNo(v: unknown): boolean {
    const s = String(v ?? '').trim().toLowerCase()
    return s === 'no' || s === 'false' || s === '0'
  }

  // 1 — Credit score (skipped if listing has no min_credit_score)
  const minCredit = parseNum(req.min_credit_score, null)
  if (minCredit !== null) {
    const selfScore = parseNum(ap.credit_score_self, null)
    const coScore   = parseNum(ap.credit_score_coborrower, null)
    const apCredit  = (selfScore !== null && coScore !== null) ? Math.min(selfScore, coScore)
      : (selfScore ?? coScore)
    if (apCredit !== null && apCredit < minCredit) {
      failed.push(`Credit score (${selfScore}${coScore !== null ? '/' + coScore : ''}, need ${minCredit}+)`)
    }
  }

  // 2 — First-time buyer (skipped if listing field is blank)
  if (isExplicitYes(req.first_time_buyer_required) && yesNo(ap.owned_real_estate)) {
    failed.push(`Owned real estate in last ${parseNum(req.no_ownership_years, 3)} years`)
  }

  // 3 — Household size: use ami_table when present, else legacy min/max columns
  const hhSize = parseNum(ap.household_size, null)
  const amiTable = req.ami_table as Record<string, Record<string, number | null>> | null | undefined

  if (amiTable && hhSize !== null) {
    const hhKey = String(Math.min(Math.max(Math.round(hhSize), 1), 8))
    const hhRow = amiTable[hhKey]
    if (!hhRow || Object.keys(hhRow).length === 0) {
      failed.push(`Household size not eligible for this program (${hhSize} person)`)
    }
  } else if (!amiTable) {
    // Legacy: min/max household size columns
    const minHH = parseNum(req.min_household_size, null)
    const maxHH = parseNum(req.max_household_size, null)
    if (hhSize !== null) {
      if (minHH !== null && hhSize < minHH) failed.push(`Household size too small (${hhSize}, min ${minHH})`)
      if (maxHH !== null && hhSize > maxHH) failed.push(`Household size too large (${hhSize}, max ${maxHH})`)
    }
  }

  // 4 — Income: use ami_table when present, else legacy per-person income columns
  const annualIncome = getApplicantIncome(ap)
  if (annualIncome !== null && hhSize !== null) {
    if (amiTable) {
      const hhKey = String(Math.min(Math.max(Math.round(hhSize), 1), 8))
      const hhRow = amiTable[hhKey]
      if (hhRow && Object.keys(hhRow).length > 0) {
        let maxInc: number | null = null
        if (amiPct !== null && hhRow[String(amiPct)] != null) {
          maxInc = Number(hhRow[String(amiPct)])
        } else {
          // No specific AMI % - use highest populated limit (least restrictive)
          const vals = Object.values(hhRow).filter(v => v != null) as number[]
          if (vals.length) maxInc = Math.max(...vals)
        }
        if (maxInc !== null && annualIncome > maxInc) {
          failed.push(`Income too high ($${fmt(annualIncome)}, max $${fmt(maxInc)})`)
        }
      }
    } else {
      // Legacy: per-person income columns (cap at 6 for old data)
      const sizeKey = `max_income_${Math.min(Math.max(Math.round(hhSize), 1), 6)}person`
      const maxInc = parseNum(req[sizeKey], null)
      const minInc = parseNum(req.min_income, null)
      if (maxInc !== null && annualIncome > maxInc) failed.push(`Income too high ($${fmt(annualIncome)}, max $${fmt(maxInc)})`)
      if (minInc !== null && annualIncome < minInc) failed.push(`Income too low ($${fmt(annualIncome)}, min $${fmt(minInc)})`)
    }
  }

  // 5 — Monthly debt + DTI (each skipped independently if listing field is blank)
  const monthlyDebt = parseNum(ap.monthly_debt_payments, null)
  if (monthlyDebt !== null) {
    const maxDebt = parseNum(req.max_monthly_debt, null)
    if (maxDebt !== null && monthlyDebt > maxDebt) failed.push(`Monthly debt too high ($${fmt(monthlyDebt)}/mo, max $${fmt(maxDebt)})`)
    const maxDTI = parseNum(req.max_dti_percent, null)
    if (maxDTI !== null && annualIncome !== null && annualIncome > 0) {
      const dti = (monthlyDebt / (annualIncome / 12)) * 100
      if (dti > maxDTI) failed.push(`DTI too high (${Math.round(dti)}%, max ${maxDTI}%)`)
    }
  }

  // 6 — SD County residency (skipped if listing field is blank)
  if (isExplicitYes(req.sd_county_residency_required)) {
    const sdMonths = parseNum(req.sd_residency_months, 24)!
    if (sdMonths >= 24) {
      if (!yesNo(ap.worked_lived_sd_2yr)) failed.push('SD County 2-year residency/work requirement not met')
    } else {
      if (!yesNo(ap.live_in_sd_county)) failed.push('SD County residency required')
    }
  }

  // 7 — Household together (skipped if listing field is blank)
  const hhTogetherMonths = parseNum(req.household_together_months, null)
  if (hhTogetherMonths !== null && hhTogetherMonths >= 12) {
    if (!yesNo(ap.lived_together_12mo)) failed.push('Household not living together 12+ months')
  }

  // 8 — SDHC (skipped if blank; only fails if listing explicitly sets NO)
  if (isExplicitNo(req.sdhc_prior_purchase_allowed) && yesNo(ap.sdhc_prior_purchase)) {
    failed.push('Prior SDHC affordable program participation')
  }

  // 9 — Foreclosure (skipped if blank; only fails if listing explicitly sets NO)
  if (yesNo(ap.foreclosure)) {
    if (isExplicitNo(req.foreclosure_allowed)) {
      failed.push('Prior foreclosure/short sale (not allowed)')
    } else if (isExplicitYes(req.foreclosure_allowed)) {
      const fcMinYrs = parseNum(req.foreclosure_min_years, null)
      if (fcMinYrs !== null) {
        const fcYrs = yearsSince(ap.foreclosure_date)
        if (fcYrs !== null && fcYrs < fcMinYrs) failed.push(`Foreclosure too recent (${Math.floor(fcYrs)} yrs ago, need ${fcMinYrs}+)`)
      }
    }
  }

  // 10 — Bankruptcy (skipped if blank; only fails if listing explicitly sets NO)
  if (yesNo(ap.bankruptcy)) {
    if (isExplicitNo(req.bankruptcy_allowed)) {
      failed.push('Prior bankruptcy (not allowed)')
    } else if (isExplicitYes(req.bankruptcy_allowed)) {
      const bkMinYrs = parseNum(req.bankruptcy_min_years, null)
      if (bkMinYrs !== null) {
        const bkYrs = yearsSince(ap.bankruptcy_discharge_date)
        if (bkYrs !== null && bkYrs < bkMinYrs) failed.push(`Bankruptcy too recent (${Math.floor(bkYrs)} yrs ago, need ${bkMinYrs}+)`)
      }
    }
  }

  // 11 — Judgments (skipped if blank; only fails if listing explicitly sets NO)
  if (isExplicitNo(req.judgments_allowed) && yesNo(ap.judgments)) {
    failed.push('Outstanding judgments/garnishments/liens')
  }

  // 12 — Citizenship (skipped if listing field is blank)
  if (isExplicitYes(req.citizenship_required)) {
    const isCitizen = yesNo(ap.us_citizen)
    const isPR      = yesNo(ap.permanent_resident)
    const prOK      = isExplicitYes(req.permanent_resident_acceptable)
    if (!isCitizen && !(prOK && isPR)) failed.push('US citizenship or permanent residency required')
  }

  // 13 — Assets (skipped if listing has no asset limits)
  const totalAssets = getTotalAssets(ap)
  if (totalAssets !== null) {
    const minA = parseNum(req.min_assets, null)
    const maxA = parseNum(req.max_assets, null)
    if (minA !== null && totalAssets < minA) failed.push(`Assets too low ($${fmt(totalAssets)}, min $${fmt(minA)})`)
    if (maxA !== null && totalAssets > maxA) failed.push(`Assets too high ($${fmt(totalAssets)}, max $${fmt(maxA)})`)
  }

  const status = failed.length === 0 ? 'Pass'
    : failed.length <= CLOSE_THRESHOLD ? 'Close'
    : 'Fail'
  return { status, failedFields: failed }
}

function getApplicantIncome(ap: Record<string, unknown>): number | null {
  let total = 0; let found = false
  for (let i = 1; i <= 8; i++) {
    const v = parseNum(ap[`income_${i}_annual`], null)
    if (v !== null) { total += v; found = true }
  }
  return found ? total : null
}

function getTotalAssets(ap: Record<string, unknown>): number | null {
  const fields = ['asset_checking','asset_savings','asset_401k','asset_other']
  let total = 0; let found = false
  for (const f of fields) {
    const v = parseNum(ap[f], null)
    if (v !== null) { total += v; found = true }
  }
  return found ? total : null
}

function parseNum(v: unknown, def: number | null): number | null {
  if (v === null || v === undefined || v === '') return def
  const n = Number(String(v).replace(/[$,%]/g,''))
  return isNaN(n) ? def : n
}

function yesNo(v: unknown, def?: string): boolean {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'yes' || s === 'true' || s === '1') return true
  if (s === 'no'  || s === 'false'|| s === '0') return false
  return def === 'yes'
}

function yearsSince(dateStr: unknown): number | null {
  if (!dateStr) return null
  const d = new Date(String(dateStr))
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
}

function fmt(n: number): string { return Math.round(n).toLocaleString() }

// ── Weekly Digest Email ─────────────────────────────────────────

interface DigestPayload {
  results: Array<{ listing_id: string; email: string; full_name: string; status: string; failed_fields: string }>
  listings: Array<Record<string, string>>
  passCount: number
  closeCount: number
  statusCounts: Record<string, number>
  newApplicantsThisWeek: number
  newSubmissionsThisWeek: number
  totalSuccesses: number
  activeListingsCount: number
}

async function sendWeeklyDigest(payload: DigestPayload) {
  const {
    results, listings, passCount, closeCount,
    statusCounts, newApplicantsThisWeek, newSubmissionsThisWeek,
    totalSuccesses, activeListingsCount,
  } = payload

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const subject = `[CA Affordable Homes] Weekly Digest - ${dateStr}`

  const listingMap: Record<string, string> = {}
  listings.forEach(l => { listingMap[l.listing_id] = l.listing_name || l.listing_id })

  const passRows  = results.filter(r => r.status === 'Pass')
  const closeRows = results.filter(r => r.status === 'Close')

  function tableRows(rows: typeof passRows) {
    return rows.map(r =>
      `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${escHtml(r.full_name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;"><a href="mailto:${escHtml(r.email)}" style="color:#2c5545;">${escHtml(r.email)}</a></td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${escHtml(listingMap[r.listing_id] || r.listing_id)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;">${escHtml(r.failed_fields || '')}</td>
      </tr>`
    ).join('')
  }

  // Pipeline status counts
  const inMatching   = (statusCounts['new'] ?? 0) + (statusCounts['reviewing'] ?? 0) + (statusCounts['active'] ?? 0)
  const totalMatched = statusCounts['matched'] ?? 0
  const totalExpired = statusCounts['expired'] ?? 0
  const totalAll     = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  function statBox(label: string, value: string | number, sub?: string) {
    return `<td style="padding:0 6px;text-align:center;vertical-align:top;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
        <div style="font-size:28px;font-weight:700;color:#2c5545;line-height:1;">${value}</div>
        <div style="font-size:11px;color:#666;margin-top:5px;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
        ${sub ? `<div style="font-size:10px;color:#aaa;margin-top:2px;">${sub}</div>` : ''}
      </div>
    </td>`
  }

  const matchSection = (passRows.length + closeRows.length) > 0 ? `
    ${passRows.length ? `
    <h3 style="color:#2c7a4b;margin:28px 0 10px;font-size:15px;">Pass (${passRows.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f0f8f4;">
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Name</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Email</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Listing</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Failed Fields</th>
      </tr></thead>
      <tbody>${tableRows(passRows)}</tbody>
    </table>` : ''}
    ${closeRows.length ? `
    <h3 style="color:#b07a00;margin:28px 0 10px;font-size:15px;">Close (${closeRows.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#fdf8ec;">
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Name</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Email</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Listing</th>
        <th style="padding:6px 10px;text-align:left;font-weight:600;">Failed Fields</th>
      </tr></thead>
      <tbody>${tableRows(closeRows)}</tbody>
    </table>` : ''}
  ` : `<p style="color:#888;font-size:14px;font-style:italic;">No Pass or Close matches this week.</p>`

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;color:#333;">

    <!-- Header -->
    <div style="background:#2c5545;padding:20px 28px;">
      <h2 style="color:#fff;margin:0;font-size:20px;font-weight:600;">CA Affordable Homes - Weekly Digest</h2>
      <p style="color:#a8c5b5;margin:4px 0 0;font-size:13px;">${escHtml(dateStr)}</p>
    </div>

    <div style="padding:28px;">

      <!-- Pipeline Snapshot -->
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin:0 0 14px;font-weight:600;">Pipeline Snapshot</h3>
      <table style="border-collapse:separate;border-spacing:0;width:100%;margin-bottom:20px;">
        <tr>
          ${statBox('Total Applicants', totalAll)}
          ${statBox('In Matching', inMatching, 'active pipeline')}
          ${statBox('New This Week', newApplicantsThisWeek)}
          ${statBox('Active Listings', activeListingsCount)}
          ${statBox('Total Successes', totalSuccesses)}
        </tr>
      </table>

      <!-- Applicant Status Breakdown + Activity -->
      <div style="margin:0 0 28px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.07em;color:#999;margin-bottom:10px;font-weight:600;">Applicants by Status</div>
        <table style="border-collapse:collapse;font-size:13px;width:100%;">
          <tr>
            <td style="padding:3px 0;color:#555;">New</td>
            <td style="padding:3px 0;font-weight:600;text-align:right;">${statusCounts['new'] ?? 0}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#555;">Reviewing</td>
            <td style="padding:3px 0;font-weight:600;text-align:right;">${statusCounts['reviewing'] ?? 0}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#555;">Active</td>
            <td style="padding:3px 0;font-weight:600;text-align:right;">${statusCounts['active'] ?? 0}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb;">
            <td style="padding:6px 0 3px;color:#555;">Matched</td>
            <td style="padding:6px 0 3px;font-weight:600;text-align:right;">${totalMatched}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#555;">Expired</td>
            <td style="padding:3px 0;font-weight:600;text-align:right;">${totalExpired}</td>
          </tr>
          <tr style="border-top:1px solid #e5e7eb;">
            <td style="padding:6px 0 3px;color:#555;">New property submissions this week</td>
            <td style="padding:6px 0 3px;font-weight:600;text-align:right;color:#2c7a4b;">${newSubmissionsThisWeek}</td>
          </tr>
        </table>
      </div>

      <!-- Matching Results -->
      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin:0 0 6px;font-weight:600;">Matching Results</h3>
      <p style="font-size:14px;color:#555;margin:0 0 4px;">
        ${passCount > 0 || closeCount > 0
          ? `<strong style="color:#2c7a4b;">${passCount} Pass</strong> &nbsp;&bull;&nbsp; <strong style="color:#b07a00;">${closeCount} Close</strong> across all active listings`
          : 'No matches this week.'}
      </p>
      ${matchSection}

      <!-- Footer link -->
      <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#888;text-align:center;">
        <a href="https://panecross.github.io/CAAffordableHomes/admin.html" style="color:#2c5545;font-weight:600;">Open Admin Portal</a>
        &nbsp;&bull;&nbsp;
        CA Affordable Homes - Weekly automated digest
      </div>

    </div>
  </div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  })
}

function escHtml(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
