# CA Affordable Homes — Project Memory (CLAUDE.md)
*Updated after each phase. Always read this before making changes.*

---

## Project Status
- **Phase 7 complete** — annual expiry, renewal emails, re-enrollment flow
- **Not yet live** — currently hosted on GitHub Pages (test environment)
- **Next up** — Phase 8 content updates (Kacee's round-3 notes), then go-live

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
- **Backend/automation:** Google Apps Script (Web App) deployed from `notify-script.gs`
- **Database:** Google Sheets (6 tabs — see below)
- **Fonts:** Cormorant Garamond + Inter (Google Fonts)
- **Icons:** Font Awesome 6 Free (CDN)
- **CSS:** Single file `css/styles.css`

---

## File Structure

```
/
├── index.html          — Home page
├── about.html          — About page
├── services.html       — Services page (buyers + organizations)
├── homes.html          — Available properties (dynamic from Sheets)
├── faq.html            — FAQ (accordion, buyers + partners)
├── contact.html        — Interest List form (multi-section questionnaire)
├── thankyou.html       — Post-submission confirmation page
├── favicon.svg
├── css/
│   └── styles.css      — All styles (single file)
├── js/
│   ├── main.js         — Nav hamburger, FAQ accordion, shared UI
│   ├── listings.js     — Fetches + renders property cards + modal on homes.html
│   └── testimonials.js — Fetches testimonials from Sheets, hidden until data exists
└── notify-script.gs    — Google Apps Script source (must be deployed manually to Apps Script)
```

---

## Google Sheet

**Spreadsheet ID:** `1YCdiFVSRTipvDD-Ylt7nv6Sq5coAG-Zjasnu9tIrmFw`

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
| 1 | Interest List Welcome | Applicant | Form submit, no listings checked | "You're on the Interest List" |
| 2 | Pre-Screening Results | Applicant | Form submit, listings checked | "Your Pre-Screening Results" |
| 3 | Internal Submission Alert | Team | Every form submit | [NEW] / [UPDATED] / [RE-ENROLLMENT] Interest List: Name |
| 4 | Daily Match Report | Team | Trigger B (if Pass/Close found) | "[CA Affordable Homes] New candidates for {listing}" |
| 5 | 11-Month Renewal Reminder | Applicant | Trigger C (11mo + no reminder sent) | "Your CA Affordable Homes profile is expiring soon" |
| 6 | MLS Inquiry Notification | Team | homes.html modal contact form | [MLS Inquiry] Property — Name |

**Email 5 note:** Includes the applicant's specific email address in the body, instructing them to use the same email when re-submitting to update their existing profile (vs. creating a new row).

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

- Multi-section questionnaire: personal info, income members (up to 6), tax-year income, employment (up to 4), financial/disclosures, listing interest
- Listing interest checkboxes: loaded live from Apps Script `?action=getListings` — shows only `affordable` listing_type rows with a non-empty status
- "I'm interested in future listings only" checkbox: mutual-exclusion with specific listing checkboxes (checking it clears all others; checking any specific listing clears it)
- Deduplication: matches on email. Expired → re-enrollment path. Non-expired → update path.
- Post-submit: redirects to `thankyou.html`

---

## Known Pending Items

1. **Repeating block header renumbering bug** (from earlier session): `incBlockCount`/`empBlockCount` are ever-incrementing; removing and re-adding income/employment blocks shows wrong numbers. Needs `renumberIncomeBlocks()` and `renumberEmpBlocks()` functions in `contact.html`. Not yet implemented.
2. **NOTIFY_EMAIL switch** — change `tj@nostos.tech` → Kacee's actual email before go-live (Phase 8).
3. **Social links** — Facebook and Instagram hrefs in footer are currently `#` on all pages. Need real URLs when accounts are set up.
4. **Copyright year** — footer shows `© 2025`. Update to current year or make dynamic at go-live.
5. **Hero background image** — currently an Unsplash placeholder URL. Replace with owned/licensed image before go-live.

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
