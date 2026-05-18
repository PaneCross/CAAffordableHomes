# CA Affordable Homes — Project Memory (CLAUDE.md)
*Updated after each phase. Always read this before making changes.*

---

## Project Status
- **Phase 13 complete** — Programs expanded display fields (MLS badge, full address, bathrooms, parking, sqft, program type, selection process); content overhaul (index, about, programs pages); SQL migration 012; admin.html + admin.js updated; new CSS classes
- **Phase 12 complete** — Mobile admin card views, program auto-sync from listings, auto-inactivate, program status pill on listings, public program card redesign
- **Phase 11 complete** — AMI table, org inquiries, program card redesign, weekly digest, matching engine update
- **Phase 10 complete** — Supabase migration: database, Edge Functions, new admin.html. Apps Script retired.
- **Not yet live** — currently hosted on GitHub Pages (test environment)
- **Phase 14 complete** — Content refinements (redundancy reduction, footer updates, about page image, listings page header); Edge Functions redeployed; SQL migration 012 run
- **Phase 15 complete** — Kacee content round: index "income-qualified buyers" addition; about h3 "Buyers"; FAQ 7 + 10 wording; questionnaire overhaul (SDHC removed, W2 Yes/No, citizenship merged, 401k required, areas simplified to 5, all dollar fields text+inputmode, buildPayload updated)
- **Next up** — Go-live prep

## ⚠️ Legal Context — MLS and Program Display Rules
California MLS Clear Cooperation Policy (adopted by NAR and all major CA MLSs): any property publicly marketed must be submitted to the MLS within 1 business day. This is why there is no standalone Available Homes page with full property listings. However, **Programs** (community/developer partnerships) may now display specific property details including addresses, pricing, bathrooms, parking, sqft, program type, and selection process - Kacee controls exactly what is shown by what she enters in the admin portal.

**MLS Listed flag:** The `mls_listed` boolean on programs controls only a badge label ("Listed on MLS" / "Not Listed on MLS"). It does NOT gate display of other fields. All fields show whenever Kacee enters data, regardless of MLS status.

**SDAR Attribution:** When any program has `mls_listed = true`, programs.js automatically injects a San Diego Association of Realtors (SDAR) attribution note below the programs grid: "Where applicable, property information is sourced from the San Diego Association of Realtors (SDAR). Information deemed reliable but not guaranteed."

**Listings tab (admin-only):** Internal listings used by the matching engine are still never exposed to the public. Only Programs are visible on the site.

---

## Deployment

- **Repo:** https://github.com/PaneCross/CAAffordableHomes
- **Live test URL:** GitHub Pages (auto-deploys from main branch on push)
- **Production domain (not live yet):** https://caaffordablehomes.com
- **Working directory for all edits:** `C:\Users\TJ\Desktop\Kacee Website\.claude\worktrees\website-files\`
- All commits push to `origin/main` from the worktree above

---

## Tech Stack

- **Frontend:** Static HTML/CSS/JS — no build tools, no frameworks
- **Hosting:** GitHub Pages
- **Database:** Supabase (PostgreSQL) — replacing Google Sheets
- **Backend/automation:** Supabase Edge Functions (Deno/TypeScript) — replacing Apps Script
- **Admin portal:** `admin.html` + `js/admin.js` on GitHub Pages — replacing Apps Script HtmlService
- **Email:** Resend API (called from Edge Functions)
- **Cron:** GitHub Actions scheduled workflows — replacing Apps Script time triggers
- **Fonts:** Cormorant Garamond + Inter (Google Fonts)
- **Icons:** Font Awesome 6 Free (CDN)
- **CSS:** `css/styles.css` (public site) + `css/admin.css` (admin)

### ⚠️ Apps Script Status
`notify-script.gs` and `admin-script.gs` are **retired** after Phase 10 cutover. Do not edit them. The old Apps Script web app URL no longer needs to be maintained.

---

## File Structure

```
/
├── index.html          — Home page
├── about.html          — About page
├── services.html       — Services page (buyers + organizations)
├── faq.html            — FAQ (accordion, buyers + partners)
├── contact.html        — Interest List form (POSTs to submit-interest Edge Function)
├── thankyou.html       — Post-submission confirmation page
├── admin.html          — Admin portal (Supabase auth, replaces Apps Script admin)
├── favicon.svg
├── css/
│   ├── styles.css      — All public site styles
│   └── admin.css       — Admin portal styles
├── js/
│   ├── main.js         — Nav hamburger, FAQ accordion, shared UI
│   ├── admin.js        — Admin app (Supabase client, all CRUD)
│   ├── programs.js     — Fetches programs from Supabase REST, renders cards
│   └── testimonials.js — Fetches testimonials from Supabase REST
├── supabase/
│   ├── config.toml     — Supabase CLI config
│   ├── migrations/
│   │   └── 001_schema.sql   — Full DB schema + RLS + upsert function (run once in SQL Editor)
│   └── functions/
│       ├── submit-interest/ — Form submission handler + welcome/notification emails
│       ├── daily-match/     — Matching engine (13 checks) + digest email
│       └── check-expiry/    — 11-month reminder + 12-month expiry
└── .github/
    └── workflows/
        └── scheduled-triggers.yml — Cron: 6 AM daily-match, 7 AM check-expiry
```

---

## Supabase

**Project URL:** `https://monybdfujogcyseyjgfx.supabase.co`
**Publishable key (safe for frontend):** `sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U`
**Service role key:** in Supabase dashboard → Settings → API (never commit to repo)

### Tables
| Table | RLS |
|-------|-----|
| `interest_list` | anon INSERT (form), authenticated read/write |
| `listings` | authenticated only |
| `programs` | anon SELECT active rows, authenticated write |
| `property_submissions` | anon INSERT, authenticated read/write |
| `match_results` | authenticated only |
| `testimonials` | anon SELECT active, authenticated write |

### Edge Functions (deploy with Supabase CLI)
```bash
supabase functions deploy submit-interest --project-ref monybdfujogcyseyjgfx
supabase functions deploy daily-match     --project-ref monybdfujogcyseyjgfx
supabase functions deploy check-expiry    --project-ref monybdfujogcyseyjgfx
```

### Edge Function Secrets (set in Supabase dashboard → Edge Functions → Manage secrets)
| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://monybdfujogcyseyjgfx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase dashboard |
| `RESEND_API_KEY` | `re_UfJNumMf_Nxn2RBWMrNPZtivszS6Lgt9B` |
| `NOTIFY_EMAIL` | `tj@nostos.tech` (switch to Kacee's at go-live) |

### GitHub Actions Secret (repo Settings → Secrets → Actions)
| Secret | Value |
|--------|-------|
| `SUPABASE_SERVICE_KEY` | service role key from Supabase dashboard |

---

## Google Sheet (RETIRED after Phase 10 cutover)

**Spreadsheet ID:** `1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw`
*Keep as read-only archive. No new data writes after cutover.*

### Tab CSV Links (for monitoring/reference)

| Tab | CSV Export URL |
|-----|---------------|
| **Dashboard** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=1209341559 |
| **Listings** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=0 |
| **Requirements** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=1529130864 |
| **Testimonials** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=1033476955 |
| **Interest List** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=1719947801 |
| **Match Results** | https://docs.google.com/spreadsheets/d/1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw/export?format=csv&gid=1757839286 |

### Published CSV URL (used by listings.js)
`https://docs.google.com/spreadsheets/d/e/2PACX-1vSLIxTKpwY7klY87Ac612ZDTJJg8AxTD35MPPjLATKp5qoAenw7j4SEhT4S9KnMrEP5cjbvwNEYu1Nb/pub?gid=0&single=true&output=csv`

### Listings Tab Column Schema (A–V)
```
A  Property Name    H  Status              O  image_url_3
B  Address          I  listing_type        P  image_url_4
C  City             J  AMI Range           Q  Description (modal section 1)
D  Price            K  Program Type        R  description_2 (Program Details)
E  Bedrooms         L  Photo URL           S  description_3 (Eligibility Notes)
F  Bathrooms        M  image_url_2         T  description_4 (Location Notes)
G  Sqft             N  (reserved)          U  description_5 (Additional Info)
                                           V  requirements_pdf_url
```
- `listing_type` values: `affordable` (default) or `mls`
- Cards show status `Available` and `Coming Soon`; filter out `closed`

---

## ⚠️ Writing Style Rules

**No em dashes anywhere on the site.** This applies to all HTML files, visible text, attributes (aria-labels, titles, meta descriptions), and form content. Do not use `—` (em dash character) or `&mdash;` (HTML entity) in any user-visible content when building or editing this site. Use a comma, a period, a colon, or a regular hyphen (` - `) as appropriate for the sentence structure.

---

## Commit Protocol

**After every update or request — no matter how small — always commit the changes before responding as complete.** Include a clear, descriptive commit message. Do not batch up multiple sessions worth of changes. Each request = its own commit.

---

## ⚠️ Apps Script Change Protocol

**Any time a change is made to `notify-script.gs`, always explicitly call this out** with a reminder that the user must manually copy the updated script into the Google Apps Script editor and redeploy (Deploy → Manage deployments → Edit → New version → Deploy). The Web App URL does not change. Do not assume the user remembers this step — always state it clearly in the response after making script changes.

Triggers are set once and do not need to be re-created after redeployment unless the function name changes.

---

## Apps Script

**Script URL (Web App):**
`https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec`

**To update:** Edit `notify-script.gs` → copy into Apps Script editor → Deploy → Manage deployments → Edit → New version → Deploy. URL stays the same.

### Triggers (set once in Apps Script Triggers panel)
| Trigger | Function | When |
|---------|----------|------|
| A | `onRequirementsEdit` | On edit of Requirements sheet |
| B | `runMatchingForAllListings` | Time-driven, 6–7 AM daily |
| C | `checkExpiryDates` | Time-driven, 7–8 AM daily |

### Configuration Variables in notify-script.gs
```javascript
SPREADSHEET_ID = '1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw'
NOTIFY_EMAIL   = 'tj@nostos.tech'   // ← switch to Kacee's email at Phase 8 launch
REPLY_TO       = 'Info@CAAffordableHomes.com'
FROM_NAME      = 'CA Affordable Homes Team'
CLOSE_THRESHOLD = 2  // max failed fields to score "Close" (vs "Fail")
```

---

## Email Automations

| # | Email | To | Fired By | Subject |
|---|-------|----|----------|---------|
| 1 | Interest List Welcome | Applicant | Every form submit | "You're on the Interest List" |
| 2 | Internal Submission Alert | Team | Every form submit | [NEW] / [UPDATED] / [RE-ENROLLMENT] Interest List: Name |
| 3 | Daily Match Digest | Team | Trigger B (if any listing has Pass/Close) | "[CA Affordable Homes] Daily Match Report — {date} (X Pass, Y Close)" |
| 4 | 11-Month Renewal Reminder | Applicant | Trigger C (11mo + no reminder sent) | "Your CA Affordable Homes profile is expiring soon" |

**Removed emails (Phase 9):**
- ~~Email 2: Pre-Screening Results~~ — sent applicants Pass/Close/Fail per listing. Removed: users must never see listing-specific match data.
- ~~Email 6: MLS Inquiry Notification~~ — fired from homes.html modal. Removed with homes page.

**Email 1 note:** Now always sent on every submission (previously only sent when no listings were selected). No listing names, scores, or match results — only confirms receipt and sets expectation that Kacee will reach out if there's a fit.

---

## Interest List Status Lifecycle

| Status | Set By | In Matching? | Auto-Expiry? |
|--------|--------|-------------|-------------|
| `new` | Auto on submit | ✅ Yes | ❌ No |
| `reviewing` | Kacee manually | ✅ Yes | ❌ No |
| `active` | Kacee manually | ✅ Yes | ✅ Yes — 12 months |
| `matched` | Kacee manually | ❌ No | ❌ No |
| `expired` | Auto at 12 months | ❌ No | N/A |

- Expiry only runs on `active` rows. `new` and `reviewing` are Kacee's responsibility.
- Re-enrollment (expired user re-submits same email): row updated in-place, clock reset, status → `active`, `renewal_reminder_sent` cleared.
- Regular re-submit (non-expired): original `submitted_at`, `status`, and `renewal_reminder_sent` preserved.

---

## Matching Engine

- Runs against all applicants with status `new`, `reviewing`, or `active`
- Skips `matched` and `expired`
- Scores: **Pass** (0 failures), **Close** (1–2 failures), **Fail** (3+ failures)
- 13 checks: credit score, first-time buyer, household size, income (AMI), DTI, monthly debt, SD County residency, household together months, SDHC prior purchase, foreclosure, bankruptcy, judgments, citizenship
- Results written to Match Results tab (upserted by listing_id + email key)
- Dashboard rebuilt automatically after each matching run

---

## Interest List Form (contact.html)

- Multi-section questionnaire: personal info, income members (up to 6), tax-year income, employment (up to 4), financial/disclosures, area preference
- Area preference: static checkboxes for 6 San Diego regions + "Other" with free-text entry. No live fetch, no listing names exposed to users.
  - North County Coastal, North County Inland, Central San Diego, East County, South Bay, City of San Diego - Urban Core, Other (free text)
- Stored in `area_preference` column of Interest List sheet (replaces `listing_interest_summary`)
- Deduplication: matches on email. Expired → re-enrollment path. Non-expired → update path.
- Post-submit: redirects to `thankyou.html`
- **No listing data is ever sent to the front-end.** `?action=getListings` endpoint removed from Apps Script.

---

## Known Pending Items

### SQL Migrations run (all confirmed complete)
- 001_schema.sql, 004–007 patches, 008_phase11.sql — all run
- 009_program_auto_sync.sql — adds zip_code/min_household_size/max_household_size to listings, household_size to programs, sync function + trigger
- 010_program_auto_inactive.sql — extends sync function with auto-inactivation when all linked listings sell out
- 011_fix_ami_percent_manual.sql — removes ami_percent from auto-sync (Kacee sets it manually as a single number)
- 012_phase13_programs_expanded.sql — adds mls_listed, full_address, bathrooms, parking, sqft, program_type, selection_process to programs; parking to listings

### Ongoing / go-live
3. **Repeating block header renumbering bug** — income/employment block numbers go wrong when removing and re-adding. Needs `renumberIncomeBlocks()` / `renumberEmpBlocks()` in `contact.html`.
4. **NOTIFY_EMAIL switch** — change `tj@nostos.tech` → Kacee's email in Supabase Edge Function secrets at go-live. Do NOT do this proactively.
5. **Social links** — footer Facebook/Instagram hrefs are `#` on all pages.
6. **Verify Resend domain** — switch FROM_EMAIL from `onboarding@resend.dev` to `noreply@caaffordablehomes.com` after domain verified.

---

## Phase Log

| Phase | Summary |
|-------|---------|
| 1 | Initial site build — all pages, nav, footer, CSS design system |
| 2 | homes.html listings — CSV fetch from Sheets, property cards, modal, carousel |
| 3 | MLS listing type — modal contact form, Apps Script `handleMLSContact` |
| 4 | Listings schema expanded to 22 columns (5 description sections, 4 photos, PDF link) |
| 5 | Interest List form — multi-section questionnaire in contact.html, Apps Script `doPost`, deduplication, `buildILRow`, `sendILNotification` |
| 6 | Listing interest checkboxes — live fetch from Apps Script `?action=getListings`, mutual-exclusion JS logic; `sendApplicantMatchEmail` with per-listing Pass/Close/Fail + bonus section; Kacee dashboard setup |
| 7 | Annual expiry lifecycle — `checkExpiryDates()` (Trigger C), `sendRenewalReminderEmail()` with same-email instruction, re-enrollment path in `doPost`, `renewal_reminder_sent` column |
| 8 | Kacee round-3 content updates — wording edits across all pages, removed "Our Commitment" section (index), removed "Our Approach" section (about), added "What We Offer" services section (about), Services page removed from nav/footer + meta redirect to about.html, EHO logo + DRE licensing in all footers, `feature-grid--2x2` CSS class added |
| 9 | Legal/compliance redesign — Available Homes page redirected to index, removed from nav/footer sitewide; listing interest checkboxes replaced with San Diego area preference; `sendApplicantMatchEmail` and `handleMLSContact` removed from Apps Script; `?action=getListings` endpoint removed; `listing_interest_summary` column renamed `area_preference`; all applicant-facing emails now listing-agnostic |
| 10 | Supabase migration — full DB schema, RLS policies, Edge Functions (submit-interest, daily-match, check-expiry), admin.html portal with Google auth, GitHub Actions cron. Apps Script retired. |
| 11 | AMI table + org inquiries + program redesign — listings: replace 9 per-person income columns with JSONB ami_table (8x4 HH size x AMI%); programs: new fields zip_code/property_type/ami_percent, remove program_type/first_time_buyer/household_size_limit; org_inquiries table + admin tab + Edge Function; interest list extended to 8 income members; programs.js redesign (area as card title); weekly digest cron (Monday); matching engine updated for ami_table with legacy fallback |
| 12 | Mobile admin card views + program automation — PS/Successes/Testimonials render as sleek cards on <=768px (table on desktop); resize listener re-renders active tab on breakpoint crossing; program auto-sync trigger (zip, bedrooms, household size, price range derived from linked active listings); AMI% stays manual (single value: 50/80/100/120); auto-inactivate program when all linked listings sell out; program status pill on Listings tab (Live on Site/Coming Soon/Inactive); listing form gains zip_code + household size fields; success modal made async with Supabase fallback (no longer breaks when IL tab not visited first); public program card redesign (soft colored backgrounds, Cormorant heading, AMI in detail list, units under title, colored left border accent) |
| 13 | Programs expanded display + content overhaul — 7 new program fields (mls_listed, full_address, bathrooms, parking, sqft, program_type, selection_process); parking added to listings; SQL migration 012; programs.js rewritten (MLS badge row, specs pill row, address/zip display, SDAR attribution injection); admin.html programs modal + listings modal updated; admin.js HELP_CONTENT updated + 3 new FAQs; new CSS classes (pc-mls-row, pc-mls-badge, pc-address-line, pc-specs-row, pc-spec-tag, pc-mls-attribution, pc-eligibility-note); index.html intro + hero copy updates; about.html story/mission/who-we-serve rewrite + local image swap; programs.html header/disclaimer overhaul + eligibility note |
| 14 | Content refinements + infrastructure — footer "San Diego County" copy + "Information deemed reliable" line across all 5 pages; about page red door image with stretch-to-column CSS; listings page moved to page-header green section; Edge Functions redeployed; all 12 SQL migrations confirmed applied |
| 15 | Kacee content round + questionnaire overhaul — index "and income-qualified buyers"; about h3 "Buyers"; FAQ 7 last sentence removed + em dash eliminated; FAQ 10 "market your property" removed; SDHC question removed; employment W2 Yes/No radios (was W-2/1099); citizenship merged to single Yes/No question; 401k made required; area checkboxes simplified to 5 clean options; all dollar inputs changed to text+inputmode=decimal; buildPayload updated (Yes/No logic, dollar stripping, permanent_resident sync) |
