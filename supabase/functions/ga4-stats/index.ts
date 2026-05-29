// ga4-stats Edge Function
// Proxies requests to the Google Analytics 4 Data API using a Google service account.
// Only responds to authenticated Supabase users (admin portal login).
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   GA4_SERVICE_ACCOUNT_JSON  – full service account JSON key file contents
//   GA4_PROPERTY_ID           – GA4 property ID (numeric string, e.g. "123456789")
//
// Returns last-7-days summary stats, daily sessions sparkline, and top 5 pages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Auth – must be a logged-in admin ───────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Check env vars ─────────────────────────────────────────────────────────
  const serviceAccountJson = Deno.env.get('GA4_SERVICE_ACCOUNT_JSON')
  const propertyId         = Deno.env.get('GA4_PROPERTY_ID')

  if (!serviceAccountJson || !propertyId) {
    // Return 200 so the dashboard can show a "not configured" state gracefully
    return new Response(JSON.stringify({ configured: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson)
    const accessToken    = await getGoogleAccessToken(serviceAccount)
    const stats          = await fetchGA4Stats(accessToken, propertyId)

    return new Response(JSON.stringify({ configured: true, ...stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('GA4 stats error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Google OAuth2 – JWT Bearer token flow ────────────────────────────────────
// Signs a JWT with the service account private key, exchanges it for an access token.
async function getGoogleAccessToken(sa: Record<string, string>): Promise<string> {
  const now     = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }

  const enc   = new TextEncoder()
  const hB64  = b64url(btoa(JSON.stringify(header)))
  const pB64  = b64url(btoa(JSON.stringify(payload)))
  const input = `${hB64}.${pB64}`

  // Strip PEM headers/footers and whitespace from the private key
  const pemStripped = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const keyBytes = Uint8Array.from(atob(pemStripped), c => c.charCodeAt(0))

  const privKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, enc.encode(input))
  const sig      = b64url(uint8ToBase64(new Uint8Array(sigBytes)))
  const jwt      = `${input}.${sig}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })

  const tokenJson = await tokenRes.json()
  if (!tokenJson.access_token) {
    throw new Error(`Google token exchange failed: ${tokenJson.error} – ${tokenJson.error_description}`)
  }
  return tokenJson.access_token
}

// ── GA4 Data API – three report calls ────────────────────────────────────────
async function fetchGA4Stats(token: string, propertyId: string) {
  const url     = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 1. Summary – sessions, users, new users, page views (last 7 days, no dimension)
  const sumRes  = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
      ],
    }),
  })
  const sumJson = await sumRes.json()
  const sumRow  = sumJson.rows?.[0]?.metricValues ?? []
  const summary = {
    sessions:  parseInt(sumRow[0]?.value ?? '0', 10),
    users:     parseInt(sumRow[1]?.value ?? '0', 10),
    newUsers:  parseInt(sumRow[2]?.value ?? '0', 10),
    pageViews: parseInt(sumRow[3]?.value ?? '0', 10),
  }

  // 2. Daily sessions – for sparkline (dimension: date, ordered asc)
  const dailyRes  = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics:    [{ name: 'sessions' }],
      orderBys:   [{ dimension: { dimensionName: 'date' } }],
    }),
  })
  const dailyJson = await dailyRes.json()
  const daily = (dailyJson.rows ?? []).map((r: any) => ({
    date:     r.dimensionValues[0].value,             // YYYYMMDD
    sessions: parseInt(r.metricValues[0].value, 10),
  }))

  // 3. Top 5 pages by screen/page views
  const pagesRes  = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics:    [{ name: 'screenPageViews' }],
      orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
    }),
  })
  const pagesJson = await pagesRes.json()
  const topPages  = (pagesJson.rows ?? []).map((r: any) => ({
    path:  r.dimensionValues[0].value,
    views: parseInt(r.metricValues[0].value, 10),
  }))

  return { summary, daily, topPages }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function b64url(s: string): string {
  return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function uint8ToBase64(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}
