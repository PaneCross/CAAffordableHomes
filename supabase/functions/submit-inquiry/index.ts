// submit-inquiry Edge Function
// Handles organization partnership inquiry form submissions
// Stores to org_inquiries table and sends email notification to team
// POST https://<project>.supabase.co/functions/v1/submit-inquiry

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const NOTIFY_EMAIL   = Deno.env.get('NOTIFY_EMAIL') ?? 'tj@nostos.tech'
const REPLY_TO       = 'Info@CAAffordableHomes.com'
const FROM_NAME      = 'CA Affordable Homes Team'
const FROM_EMAIL     = 'onboarding@resend.dev' // switch to noreply@caaffordablehomes.com after domain verified

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

    if (!data.contact_email && !data.email) {
      return new Response(JSON.stringify({ ok: false, error: 'Email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const email = (data.contact_email || data.email || '').toString().trim()
    const name  = (data.contact_name  || data.name  || '').toString().trim()
    const org   = (data.organization  || '').toString().trim()
    const phone = (data.contact_phone || data.phone || '').toString().trim()
    const msg   = (data.message || '').toString().trim()

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    const { error } = await supabase.from('org_inquiries').insert({
      contact_name:  name  || null,
      organization:  org   || null,
      contact_email: email || null,
      contact_phone: phone || null,
      message:       msg   || null,
      status: 'new',
    })

    if (error) throw error

    // Send notification email to team
    await sendNotification({ name, org, email, phone, msg })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('submit-inquiry error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function sendNotification(d: { name: string; org: string; email: string; phone: string; msg: string }) {
  const subject = `[NEW] Partnership Inquiry: ${d.org || d.name || 'Unknown'}`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#333;">
      <div style="background:#2c5545;padding:16px 24px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">[NEW] Partnership Inquiry</h2>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:160px;">Name</td><td><strong>${escHtml(d.name || '-')}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Organization</td><td>${escHtml(d.org || '-')}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td><a href="mailto:${escHtml(d.email)}">${escHtml(d.email || '-')}</a></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Phone</td><td>${escHtml(d.phone || '-')}</td></tr>
        </table>
        ${d.msg ? `
        <div style="margin-top:20px;padding:16px;background:#f9fafb;border-radius:6px;font-size:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#999;margin-bottom:8px;">Message</div>
          <p style="margin:0;white-space:pre-wrap;">${escHtml(d.msg)}</p>
        </div>` : ''}
        <p style="margin-top:20px;font-size:13px;color:#888;">
          This inquiry has been saved to the
          <a href="https://panecross.github.io/CAAffordableHomes/admin.html#org-inquiries" style="color:#2c5545;">admin portal</a>.
        </p>
      </div>
    </div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [NOTIFY_EMAIL],
      reply_to: d.email || REPLY_TO,
      subject,
      html,
    }),
  })
}

function escHtml(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
