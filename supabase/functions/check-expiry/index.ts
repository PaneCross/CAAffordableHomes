// check-expiry Edge Function
// Marks active applicants expired at 12 months, sends renewal reminder at 11 months
// Triggered by GitHub Actions cron at 7 AM daily

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = 'onboarding@resend.dev' // switch to noreply@caaffordablehomes.com after domain verified
const FROM_NAME      = 'CA Affordable Homes Team'
const REPLY_TO       = 'Info@CAAffordableHomes.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const now = new Date()

  try {
    const { data: activeRows, error } = await supabase
      .from('interest_list')
      .select('id, email, full_name, submitted_at, renewal_reminder_sent')
      .eq('status', 'active')
    if (error) throw error

    let expired = 0, reminded = 0

    for (const row of activeRows || []) {
      const submitted = new Date(row.submitted_at)
      const monthsElapsed = (now.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24 * 30.44)

      if (monthsElapsed >= 12) {
        await supabase.from('interest_list').update({ status: 'expired', updated_at: now }).eq('id', row.id)
        expired++
      } else if (monthsElapsed >= 11 && !row.renewal_reminder_sent) {
        await sendRenewalReminder(row.email, row.full_name || 'Applicant')
        await supabase.from('interest_list').update({ renewal_reminder_sent: true, updated_at: now }).eq('id', row.id)
        reminded++
      }
    }

    return new Response(JSON.stringify({ ok: true, expired, reminded }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('check-expiry error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function sendRenewalReminder(email: string, name: string) {
  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#2c5545;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:400;">CA Affordable Homes</h1>
      </div>
      <div style="padding:32px 24px;">
        <p>Dear ${escHtml(name)},</p>
        <p>Your CA Affordable Homes interest list profile will expire in approximately one month.</p>
        <p>To stay on the interest list, please resubmit your information using the same email address
           at <a href="https://panecross.github.io/CAAffordableHomes/contact.html" style="color:#2c5545;">our interest list form</a>.
           Your profile will be updated and your eligibility clock will reset.</p>
        <p>If you no longer wish to be on the interest list, no action is needed and your profile will
           expire automatically.</p>
        <p style="margin-top:32px;">Warm regards,<br>
          <strong>CA Affordable Homes Team</strong><br>
          <a href="mailto:${REPLY_TO}" style="color:#2c5545;">${REPLY_TO}</a>
        </p>
      </div>
      <div style="background:#f5f5f0;padding:16px 24px;font-size:11px;color:#888;text-align:center;">
        CA Affordable Homes &bull; Equal Housing Opportunity
      </div>
    </div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [email],
      reply_to: REPLY_TO,
      subject: 'Your CA Affordable Homes profile is expiring soon',
      html,
    }),
  })
}

function escHtml(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
