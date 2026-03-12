/* =========================================================
   CA Affordable Homes — listings.js
   Fetches property listings from a published Google Sheet
   and renders them as property cards on homes.html

   HOW TO UPDATE YOUR LISTINGS:
   1. Go to your Google Sheet
   2. File → Share → Publish to web → select "CSV" → Copy link
   3. Paste that link as the value of SHEET_CSV_URL below
   4. Save this file — that's it!
   ========================================================= */

// ─────────────────────────────────────────────────────────
// STEP 1: Paste your Google Sheet CSV URL here.
// This is the ONLY line you (or your web developer) need to
// change to connect your Google Sheet to this website.
// ─────────────────────────────────────────────────────────
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLIxTKpwY7klY87Ac612ZDTJJg8AxTD35MPPjLATKp5qoAenw7j4SEhT4S9KnMrEP5cjbvwNEYu1Nb/pub?gid=0&single=true&output=csv';

// ─────────────────────────────────────────────────────────
// Developer warning if URL has not been configured
// ─────────────────────────────────────────────────────────
if (SHEET_CSV_URL === 'PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
  console.warn(
    '[CA Affordable Homes] listings.js: SHEET_CSV_URL has not been configured.\n' +
    'To connect your Google Sheet:\n' +
    '  1. Open your Google Sheet\n' +
    '  2. File → Share → Publish to web → CSV → Copy link\n' +
    '  3. Replace PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE in js/listings.js with that link\n' +
    'See README.md for detailed instructions.'
  );
}

/* ---------------------------------------------------------
   SECTION: DOM Container
   --------------------------------------------------------- */
const listingsGrid = document.getElementById('listings-grid');

// Only run on pages that include the listings grid
if (listingsGrid) {
  initListings();
}

/* ---------------------------------------------------------
   SECTION: Main init function
   --------------------------------------------------------- */
function initListings() {
  showLoadingState();

  if (SHEET_CSV_URL === 'PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    showErrorState();
    return;
  }

  fetch(SHEET_CSV_URL)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Network response was not ok: ' + response.status);
      }
      return response.text();
    })
    .then(function (csvText) {
      const listings = parseCSV(csvText);
      const activeListings = listings.filter(function (row) {
        return row['Status'] && row['Status'].trim().toLowerCase() !== 'closed';
      });

      if (activeListings.length === 0) {
        showEmptyState();
      } else {
        renderListings(activeListings);
      }
    })
    .catch(function (error) {
      console.error('[CA Affordable Homes] Failed to load listings:', error);
      showErrorState();
    });
}

/* ---------------------------------------------------------
   SECTION: CSV Parser
   Handles quoted fields, commas inside quotes, newlines
   --------------------------------------------------------- */
function parseCSV(text) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVRow(line);
    const obj = {};
    headers.forEach(function (header, index) {
      obj[header.trim()] = values[index] !== undefined ? values[index].trim() : '';
    });
    rows.push(obj);
  }

  return rows;
}

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/* ---------------------------------------------------------
   SECTION: Render Listings
   --------------------------------------------------------- */
function renderListings(listings) {
  listingsGrid.innerHTML = '';

  listings.forEach(function (listing) {
    const card = createPropertyCard(listing);
    listingsGrid.appendChild(card);
  });
}

/* ---------------------------------------------------------
   SECTION: Property Card Builder
   --------------------------------------------------------- */
function createPropertyCard(listing) {
  const name        = listing['Property Name']  || 'Property';
  const address     = listing['Address']         || '';
  const city        = listing['City']            || '';
  const price       = listing['Price']           || '';
  const bedrooms    = listing['Bedrooms']        || '';
  const bathrooms   = listing['Bathrooms']       || '';
  const sqft        = listing['Sqft']            || '';
  const status      = listing['Status']          || 'Available';
  const description = listing['Description']     || '';
  const photoURL    = listing['Photo URL']       || '';
  const amiRange    = listing['AMI Range']       || '';
  const programType = listing['Program Type']    || '';

  // Build the "Learn More" URL (links to contact page with property pre-filled)
  const encodedName = encodeURIComponent(name);
  const ctaHref = 'contact.html?property=' + encodedName;

  // Status badge
  const statusLower = status.trim().toLowerCase();
  const badgeClass = statusLower === 'available'
    ? 'status-badge--available'
    : 'status-badge--coming-soon';

  // Image fallback
  const imgSrc = photoURL
    ? photoURL
    : 'https://placehold.co/600x400/818b7e/f5f5f5?text=' + encodeURIComponent(name);

  // Build meta items
  const metaItems = [];
  if (city)      metaItems.push('<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>' + escapeHTML(city) + '</span>');
  if (bedrooms)  metaItems.push('<span><i class="fa-solid fa-bed" aria-hidden="true"></i>' + escapeHTML(bedrooms) + ' Bed</span>');
  if (bathrooms) metaItems.push('<span><i class="fa-solid fa-bath" aria-hidden="true"></i>' + escapeHTML(bathrooms) + ' Bath</span>');
  if (sqft)      metaItems.push('<span><i class="fa-solid fa-expand" aria-hidden="true"></i>' + escapeHTML(sqft) + ' sq ft</span>');

  // Build tags
  const tags = [];
  if (amiRange)    tags.push('<span class="tag">' + escapeHTML(amiRange) + '</span>');
  if (programType) tags.push('<span class="tag">' + escapeHTML(programType) + '</span>');

  const card = document.createElement('article');
  card.className = 'property-card';
  card.setAttribute('aria-label', name);

  card.innerHTML = `
    <div class="property-card__image-wrap">
      <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(name)}" loading="lazy" onerror="this.src='https://placehold.co/600x400/818b7e/f5f5f5?text=Photo+Coming+Soon'">
      <span class="status-badge ${badgeClass}">${escapeHTML(status)}</span>
    </div>
    <div class="property-card__body">
      <h3 class="property-card__name">${escapeHTML(name)}</h3>
      <div class="property-card__meta">
        ${metaItems.join('')}
      </div>
      <div class="property-card__price">${escapeHTML(price)}</div>
      ${tags.length ? '<div class="property-card__tags">' + tags.join('') + '</div>' : ''}
      ${description ? '<p class="property-card__description">' + escapeHTML(description) + '</p>' : ''}
      <div class="property-card__footer">
        <a href="${ctaHref}" class="btn btn-primary">
          Learn More
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  `;

  return card;
}

/* ---------------------------------------------------------
   SECTION: State Messages
   --------------------------------------------------------- */
function showLoadingState() {
  listingsGrid.innerHTML = `
    <div class="listing-status" role="status" aria-live="polite">
      <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
      <p>Loading available properties&hellip;</p>
    </div>
  `;
}

function showErrorState() {
  listingsGrid.innerHTML = `
    <div class="listing-status" role="alert">
      <i class="fa-solid fa-house-circle-exclamation" aria-hidden="true"></i>
      <p>Listings are being updated. Please check back shortly or <a href="contact.html">contact us directly</a>.</p>
    </div>
  `;
}

function showEmptyState() {
  listingsGrid.innerHTML = `
    <div class="listing-status" role="status">
      <i class="fa-solid fa-house" aria-hidden="true"></i>
      <p>No properties are currently listed. Sign up below to be notified when new homes become available.</p>
    </div>
  `;
}

/* ---------------------------------------------------------
   SECTION: Utility — HTML Escape (XSS prevention)
   --------------------------------------------------------- */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}
