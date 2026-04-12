// daily-match Edge Function
// Runs the matching engine: evaluates all active applicants against all active listings
// Writes results to match_results table, sends daily digest email to team
// Triggered by GitHub Actions cron at 6 AM daily

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
    // Load active listings
    const { data: listings, error: lstErr } = await supabase
      .from('listings')
      .select('*')
      .eq('active', 'YES')
    if (lstErr) throw lstErr
    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No active listings' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Load eligible applicants
    const { data: applicants, error: apErr } = await supabase
      .from('interest_list')
      .select('*')
      .in('status', ['new', 'reviewing', 'active'])
    if (apErr) throw apErr
    if (!applicants || applicants.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No eligible applicants' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const results: Array<{
      listing_id: string; email: string; full_name: string; status: string; failed_fields: string
    }> = []

    for (const listing of listings) {
      for (const ap of applicants) {
        const { status, failedFields } = evaluateApplicant(ap, listing)
        results.push({
          listing_id:   listing.listing_id,
          email:        ap.email,
          full_name:    ap.full_name || ap.email,
          status,
          failed_fields: failedFields.join(' | '),
        })
      }
    }

    // Upsert all results
    if (results.length > 0) {
      const { error: upsertErr } = await supabase
        .from('match_results')
        .upsert(results, { onConflict: 'listing_id,email' })
      if (upsertErr) throw upsertErr
    }

    // Count Pass/Close for digest
    const passCount  = results.filter(r => r.status === 'Pass').length
    const closeCount = results.filter(r => r.status === 'Close').length

    if (passCount + closeCount > 0) {
      await sendDigestEmail(results, listings, passCount, closeCount)
    }

    return new Response(JSON.stringify({
      ok: true,
      listings: listings.length,
      applicants: applicants.length,
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

function evaluateApplicant(ap: Record<string, string>, req: Record<string, string>) {
  const failed: string[] = []

  // 1 — Credit score
  const minCredit = parseNum(req.min_credit_score, 640)
  const selfScore = parseNum(ap.credit_score_self, null)
  const coScore   = parseNum(ap.credit_score_coborrower, null)
  const apCredit  = (selfScore !== null && coScore !== null) ? Math.min(selfScore, coScore)
    : (selfScore ?? coScore)
  if (apCredit !== null && apCredit < minCredit!) {
    failed.push(`Credit score (${selfScore}${coScore !== null ? '/' + coScore : ''}, need ${minCredit}+)`)
  }

  // 2 — First-time buyer
  if (yesNo(req.first_time_buyer_required, 'yes') && yesNo(ap.owned_real_estate)) {
    failed.push(`Owned real estate in last ${parseNum(req.no_ownership_years, 3)} years`)
  }

  // 3 — Household size
  const hhSize = parseNum(ap.household_size, null)
  const minHH  = parseNum(req.min_household_size, null)
  const maxHH  = parseNum(req.max_household_size, null)
  if (hhSize !== null) {
    if (minHH !== null && hhSize < minHH) failed.push(`Household size too small (${hhSize}, min ${minHH})`)
    if (maxHH !== null && hhSize > maxHH) failed.push(`Household size too large (${hhSize}, max ${maxHH})`)
  }

  // 4 — Income
  const annualIncome = getApplicantIncome(ap)
  if (annualIncome !== null && hhSize !== null) {
    const sizeKey = `max_income_${Math.min(Math.max(Math.round(hhSize), 1), 6)}person`
    const maxInc  = parseNum(req[sizeKey], null)
    const minInc  = parseNum(req.min_income, null)
    if (maxInc !== null && annualIncome > maxInc) failed.push(`Income too high ($${fmt(annualIncome)}, max $${fmt(maxInc)})`)
    if (minInc !== null && annualIncome < minInc) failed.push(`Income too low ($${fmt(annualIncome)}, min $${fmt(minInc)})`)
  }

  // 5 — Monthly debt + DTI
  const monthlyDebt = parseNum(ap.monthly_debt_payments, null)
  if (monthlyDebt !== null) {
    const maxDebt = parseNum(req.max_monthly_debt, null)
    if (maxDebt !== null && monthlyDebt > maxDebt) failed.push(`Monthly debt too high ($${fmt(monthlyDebt)}/mo, max $${fmt(maxDebt)})`)
    const maxDTI = parseNum(req.max_dti_percent, 45)
    if (maxDTI !== null && annualIncome !== null && annualIncome > 0) {
      const dti = (monthlyDebt / (annualIncome / 12)) * 100
      if (dti > maxDTI) failed.push(`DTI too high (${Math.round(dti)}%, max ${maxDTI}%)`)
    }
  }

  // 6 — SD County residency
  if (yesNo(req.sd_county_residency_required, 'yes')) {
    const sdMonths = parseNum(req.sd_residency_months, 24)!
    if (sdMonths >= 24) {
      if (!yesNo(ap.worked_lived_sd_2yr)) failed.push('SD County 2-year residency/work requirement not met')
    } else {
      if (!yesNo(ap.live_in_sd_county)) failed.push('SD County residency required')
    }
  }

  // 7 — Household together
  if ((parseNum(req.household_together_months, 12) ?? 12) >= 12) {
    if (!yesNo(ap.lived_together_12mo)) failed.push('Household not living together 12+ months')
  }

  // 8 — SDHC
  if (!yesNo(req.sdhc_prior_purchase_allowed, 'yes') && yesNo(ap.sdhc_prior_purchase)) {
    failed.push('Prior SDHC affordable program participation')
  }

  // 9 — Foreclosure
  if (yesNo(ap.foreclosure)) {
    if (!yesNo(req.foreclosure_allowed, 'yes')) {
      failed.push('Prior foreclosure/short sale (not allowed)')
    } else {
      const fcMinYrs = parseNum(req.foreclosure_min_years, null)
      if (fcMinYrs !== null) {
        const fcYrs = yearsSince(ap.foreclosure_date)
        if (fcYrs !== null && fcYrs < fcMinYrs) failed.push(`Foreclosure too recent (${Math.floor(fcYrs)} yrs ago, need ${fcMinYrs}+)`)
      }
    }
  }

  // 10 — Bankruptcy
  if (yesNo(ap.bankruptcy)) {
    if (!yesNo(req.bankruptcy_allowed, 'yes')) {
      failed.push('Prior bankruptcy (not allowed)')
    } else {
      const bkMinYrs = parseNum(req.bankruptcy_min_years, null)
      if (bkMinYrs !== null) {
        const bkYrs = yearsSince(ap.bankruptcy_discharge_date)
        if (bkYrs !== null && bkYrs < bkMinYrs) failed.push(`Bankruptcy too recent (${Math.floor(bkYrs)} yrs ago, need ${bkMinYrs}+)`)
      }
    }
  }

  // 11 — Judgments
  if (!yesNo(req.judgments_allowed, 'yes') && yesNo(ap.judgments)) {
    failed.push('Outstanding judgments/garnishments/liens')
  }

  // 12 — Citizenship
  if (yesNo(req.citizenship_required, 'yes')) {
    const isCitizen = yesNo(ap.us_citizen)
    const isPR      = yesNo(ap.permanent_resident)
    const prOK      = yesNo(req.permanent_resident_acceptable, 'yes')
    if (!isCitizen && !(prOK && isPR)) failed.push('US citizenship or permanent residency required')
  }

  // 13 — Assets
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

function getApplicantIncome(ap: Record<string, string>): number | null {
  let total = 0; let found = false
  for (let i = 1; i <= 6; i++) {
    const v = parseNum(ap[`income_${i}_annual`], null)
    if (v !== null) { total += v; found = true }
  }
  return found ? total : null
}

function getTotalAssets(ap: Record<string, string>): number | null {
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

// ── Digest email ───────────────────────────────────────────────

async function sendDigestEmail(
  results: Array<{ listing_id: string; email: string; full_name: string; status: string; failed_fields: string }>,
  listings: Array<Record<string, string>>,
  passCount: number,
  closeCount: number
) {
  const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
  const subject = `[CA Affordable Homes] Daily Match Report - ${date} (${passCount} Pass, ${closeCount} Close)`

  const listingMap: Record<string, string> = {}
  listings.forEach(l => { listingMap[l.listing_id] = l.listing_name || l.listing_id })

  const passRows = results.filter(r => r.status === 'Pass')
  const closeRows = results.filter(r => r.status === 'Close')

  function tableRows(rows: typeof passRows) {
    return rows.map(r =>
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${escHtml(r.full_name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;"><a href="mailto:${escHtml(r.email)}">${escHtml(r.email)}</a></td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${escHtml(listingMap[r.listing_id] || r.listing_id)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#666;">${escHtml(r.failed_fields || '')}</td>
      </tr>`
    ).join('')
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;color:#333;">
      <div style="background:#2c5545;padding:16px 24px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">Daily Match Report - ${escHtml(date)}</h2>
      </div>
      <div style="padding:24px;">
        <p style="font-size:15px;"><strong>${passCount} Pass</strong> &bull; <strong>${closeCount} Close</strong></p>
        ${passRows.length ? `
        <h3 style="color:#2c7a4b;margin-top:24px;">Pass (${passRows.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f0f8f4;">
            <th style="padding:6px 8px;text-align:left;">Name</th>
            <th style="padding:6px 8px;text-align:left;">Email</th>
            <th style="padding:6px 8px;text-align:left;">Listing</th>
            <th style="padding:6px 8px;text-align:left;">Failed Fields</th>
          </tr></thead>
          <tbody>${tableRows(passRows)}</tbody>
        </table>` : ''}
        ${closeRows.length ? `
        <h3 style="color:#b07a00;margin-top:24px;">Close (${closeRows.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#fdf8ec;">
            <th style="padding:6px 8px;text-align:left;">Name</th>
            <th style="padding:6px 8px;text-align:left;">Email</th>
            <th style="padding:6px 8px;text-align:left;">Listing</th>
            <th style="padding:6px 8px;text-align:left;">Failed Fields</th>
          </tr></thead>
          <tbody>${tableRows(closeRows)}</tbody>
        </table>` : ''}
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
