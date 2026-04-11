// submit-interest Edge Function
// Handles interest list form submissions: dedup, email welcome, email team notification
// POST https://<project>.supabase.co/functions/v1/submit-interest

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const NOTIFY_EMAIL     = Deno.env.get('NOTIFY_EMAIL') ?? 'tj@nostos.tech'
const REPLY_TO         = 'Info@CAAffordableHomes.com'
const FROM_NAME        = 'CA Affordable Homes Team'
const FROM_EMAIL       = 'noreply@caaffordablehomes.com' // update after domain verified in Resend

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const data = await req.json()

    if (!data.email) {
      return new Response(JSON.stringify({ ok: false, error: 'Email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role client to call the upsert function
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: result, error } = await supabase
      .rpc('upsert_interest_list', { payload: data })

    if (error) throw error
    if (!result.ok) throw new Error(result.error || 'Upsert failed')

    const applicantName = (result.full_name || data.full_name || 'Applicant').toString().trim()
    const applicantEmail = (result.email || data.email).toString().trim()
    const resultType = result.type // 'new' | 'updated' | 're_enrollment'

    // Send emails concurrently
    await Promise.allSettled([
      sendWelcomeEmail(applicantName, applicantEmail),
      sendInternalNotification(data, applicantName, applicantEmail, resultType),
    ])

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('submit-interest error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// ── Email helpers ──────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      reply_to: replyTo || REPLY_TO,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
  }
}

async function sendWelcomeEmail(name: string, email: string) {
  const subject = "You're on the Interest List"
  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#2c5545;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;letter-spacing:.5px;">CA Affordable Homes</h1>
      </div>
      <div style="padding:32px 24px;">
        <p style="font-size:16px;">Dear ${escHtml(name)},</p>
        <p>Thank you for submitting your information. You are now on the CA Affordable Homes interest list.</p>
        <p>Our team reviews each submission carefully. If your profile is a strong match for an available property,
           Kacee will reach out to you directly with next steps.</p>
        <p>There is nothing else you need to do right now. Your information is on file and will be considered
           as properties become available.</p>
        <p style="margin-top:32px;">Warm regards,<br>
           <strong>CA Affordable Homes Team</strong><br>
           <a href="mailto:${REPLY_TO}" style="color:#2c5545;">${REPLY_TO}</a>
        </p>
      </div>
      <div style="background:#f5f5f0;padding:16px 24px;font-size:11px;color:#888;text-align:center;">
        CA Affordable Homes &bull; DRE #[DRE] &bull; Equal Housing Opportunity
      </div>
    </div>`
  await sendEmail(email, subject, html)
}

async function sendInternalNotification(
  data: Record<string, unknown>,
  name: string,
  email: string,
  type: string
) {
  const tag = type === 're_enrollment' ? '[RE-ENROLLMENT]' : type === 'updated' ? '[UPDATED]' : '[NEW]'
  const subject = `${tag} Interest List: ${name}`
  const areaPreference = data.area_preference ? String(data.area_preference) : 'Not specified'
  const creditSelf = data.credit_score_self ? String(data.credit_score_self) : '-'
  const creditCo   = data.credit_score_coborrower ? ` / ${data.credit_score_coborrower}` : ''
  const hhSize     = data.household_size ? String(data.household_size) : '-'
  const monthlyDebt = data.monthly_debt_payments ? `$${data.monthly_debt_payments}` : '-'

  const incomeLines = [1,2,3,4,5,6].map(n => {
    const nm = data[`income_${n}_name`]
    const amt = data[`income_${n}_annual`]
    if (!nm && !amt) return ''
    return `<tr><td style="padding:4px 8px;">${escHtml(String(nm||''))}</td><td style="padding:4px 8px;">${escHtml(String(amt||''))}</td></tr>`
  }).filter(Boolean).join('')

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#333;">
      <div style="background:#2c5545;padding:16px 24px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">${escHtml(subject)}</h2>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:180px;">Name</td><td><strong>${escHtml(name)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Phone</td><td>${escHtml(String(data.phone||'-'))}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Credit Score</td><td>${creditSelf}${creditCo}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Household Size</td><td>${hhSize}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Monthly Debt</td><td>${monthlyDebt}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Area Preference</td><td>${escHtml(areaPreference)}</td></tr>
        </table>
        ${incomeLines ? `
        <h3 style="font-size:14px;margin-top:20px;border-bottom:1px solid #eee;padding-bottom:6px;">Income Members</h3>
        <table style="font-size:13px;border-collapse:collapse;">
          <tr style="background:#f5f5f0;"><th style="padding:4px 8px;text-align:left;">Name</th><th style="padding:4px 8px;text-align:left;">Annual Income</th></tr>
          ${incomeLines}
        </table>` : ''}
      </div>
    </div>`

  await sendEmail(NOTIFY_EMAIL, subject, html, email)
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
