/* =========================================================
   CA Affordable Homes — listings.js
   Fetches property listings from a published Google Sheet
   and renders them as property cards + modal on homes.html

   HOW TO UPDATE YOUR LISTINGS:
   1. Go to your Google Sheet
   2. File → Share → Publish to web → select "CSV" → Copy link
   3. Paste that link as the value of SHEET_CSV_URL below
   4. Save this file — that's it!
   ========================================================= */

// ─────────────────────────────────────────────────────────
// STEP 1: Paste your Google Sheet CSV URL here.
// ─────────────────────────────────────────────────────────
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLIxTKpwY7klY87Ac612ZDTJJg8AxTD35MPPjLATKp5qoAenw7j4SEhT4S9KnMrEP5cjbvwNEYu1Nb/pub?gid=0&single=true&output=csv';

// Apps Script endpoint — same one used by contact.html
const LISTINGS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw0MOVFTvtDia4k_bcGVtgcwb-7EhWczMzSdLpaesRDUqV4ZmUpJ6CU75B09ee9tXHO/exec';

// ─────────────────────────────────────────────────────────
// LISTINGS SHEET — column headers in order (Phase 4 schema)
//
//  A  Property Name      H  Status               O  image_url_3
//  B  Address            I  listing_type         P  image_url_4
//  C  City               J  AMI Range            Q  Description      (modal section 1)
//  D  Price              K  Program Type         R  description_2    (modal section 2 — Program Details)
//  E  Bedrooms           L  Photo URL            S  description_3    (modal section 3 — Eligibility Notes)
//  F  Bathrooms          M  image_url_2          T  description_4    (modal section 4 — Location Notes)
//  G  Sqft               N  (reserved)           U  description_5    (modal section 5 — Additional Info)
//                                                V  requirements_pdf_url
//
//  listing_type values: "affordable" (default) or "mls"
// ─────────────────────────────────────────────────────────

// Labels displayed in the modal for each description slot
var DESC_LABELS = ['Description', 'Program Details', 'Eligibility Notes', 'Location Notes', 'Additional Info'];

// ─────────────────────────────────────────────────────────
if (SHEET_CSV_URL === 'PASTE_YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
  console.warn('[CA Affordable Homes] listings.js: SHEET_CSV_URL has not been configured.');
}

/* ---------------------------------------------------------
   SECTION: Init
   --------------------------------------------------------- */
var listingsGrid  = document.getElementById('listings-grid');
var listingModal  = null;
var modalLastFocus = null;
var carouselIndex = 0;

if (listingsGrid) {
  listingModal = createModal();
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
    .then(function(response) {
      if (!response.ok) throw new Error('Network response was not ok: ' + response.status);
      return response.text();
    })
    .then(function(csvText) {
      var listings = parseCSV(csvText);
      var active = listings.filter(function(row) {
        return row['Status'] && row['Status'].trim().toLowerCase() !== 'closed';
      });
      if (active.length === 0) {
        showEmptyState();
      } else {
        renderListings(active);
      }
    })
    .catch(function(error) {
      console.error('[CA Affordable Homes] Failed to load listings:', error);
      showErrorState();
    });
}

/* ---------------------------------------------------------
   SECTION: CSV Parser
   --------------------------------------------------------- */
function parseCSV(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  var headers = parseCSVRow(lines[0]);
  var rows = [];

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var values = parseCSVRow(line);
    var obj = {};
    headers.forEach(function(header, index) {
      obj[header.trim()] = values[index] !== undefined ? values[index].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVRow(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var char = line[i];
    var nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
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
  listings.forEach(function(listing) {
    listingsGrid.appendChild(createPropertyCard(listing));
  });
}

/* ---------------------------------------------------------
   SECTION: Property Card Builder
   --------------------------------------------------------- */
function createPropertyCard(listing) {
  var name        = listing['Property Name'] || 'Property';
  var address     = listing['Address']        || '';
  var city        = listing['City']           || '';
  var price       = listing['Price']          || '';
  var bedrooms    = listing['Bedrooms']       || '';
  var bathrooms   = listing['Bathrooms']      || '';
  var sqft        = listing['Sqft']           || '';
  var status      = listing['Status']         || 'Available';
  var description = listing['Description']    || listing['description_1'] || '';
  var photoURL    = listing['Photo URL']      || '';
  var amiRange    = listing['AMI Range']      || '';
  var programType = listing['Program Type']   || '';
  var listingType = (listing['listing_type']  || 'affordable').trim().toLowerCase();

  var statusLower = status.trim().toLowerCase();
  var badgeClass  = statusLower === 'available' ? 'status-badge--available' : 'status-badge--coming-soon';
  var imgSrc      = photoURL
    ? photoURL
    : 'https://placehold.co/600x400/818b7e/f5f5f5?text=' + encodeURIComponent(name);

  var metaItems = [];
  if (city)      metaItems.push('<span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>' + escapeHTML(city) + '</span>');
  if (bedrooms)  metaItems.push('<span><i class="fa-solid fa-bed" aria-hidden="true"></i>' + escapeHTML(bedrooms) + ' Bed</span>');
  if (bathrooms) metaItems.push('<span><i class="fa-solid fa-bath" aria-hidden="true"></i>' + escapeHTML(bathrooms) + ' Bath</span>');
  if (sqft)      metaItems.push('<span><i class="fa-solid fa-expand" aria-hidden="true"></i>' + escapeHTML(sqft) + ' sq ft</span>');

  var tags = [];
  if (listingType === 'mls') tags.push('<span class="tag tag--mls">MLS Listing</span>');
  if (amiRange)              tags.push('<span class="tag">' + escapeHTML(amiRange) + '</span>');
  if (programType)           tags.push('<span class="tag">' + escapeHTML(programType) + '</span>');

  var card = document.createElement('article');
  card.className = 'property-card';
  card.setAttribute('aria-label', name);

  card.innerHTML =
    '<div class="property-card__image-wrap">' +
      '<img src="' + escapeHTML(imgSrc) + '" alt="' + escapeHTML(name) + '" loading="lazy"' +
      ' onerror="this.src=\'https://placehold.co/600x400/818b7e/f5f5f5?text=Photo+Coming+Soon\'">' +
      '<span class="status-badge ' + badgeClass + '">' + escapeHTML(status) + '</span>' +
    '</div>' +
    '<div class="property-card__body">' +
      '<h3 class="property-card__name">' + escapeHTML(name) + '</h3>' +
      '<div class="property-card__meta">' + metaItems.join('') + '</div>' +
      '<div class="property-card__price">' + escapeHTML(price) + '</div>' +
      (tags.length ? '<div class="property-card__tags">' + tags.join('') + '</div>' : '') +
      (description ? '<p class="property-card__description">' + escapeHTML(description) + '</p>' : '') +
      '<div class="property-card__footer">' +
        '<button type="button" class="btn btn-primary" aria-haspopup="dialog">' +
          'Learn More <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
        '</button>' +
      '</div>' +
    '</div>';

  var btn = card.querySelector('button');
  btn._listingData = listing;
  btn.addEventListener('click', function() {
    openModal(this._listingData, this);
  });

  return card;
}

/* ---------------------------------------------------------
   SECTION: Modal — creation (once on page load)
   --------------------------------------------------------- */
function createModal() {
  var el = document.createElement('div');
  el.id = 'listing-modal';
  el.className = 'lm-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'lm-title');
  el.hidden = true;

  el.innerHTML =
    '<div class="lm-panel" id="lm-panel" tabindex="-1">' +
      '<button class="lm-close" id="lm-close" aria-label="Close listing details">' +
        '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
      '</button>' +
      '<div id="lm-content"></div>' +
    '</div>';

  document.body.appendChild(el);

  // Click outside panel → close
  el.addEventListener('click', function(e) {
    if (e.target === el) closeModal();
  });
  el.querySelector('#lm-close').addEventListener('click', closeModal);

  // ESC closes; Tab trapped inside
  document.addEventListener('keydown', function(e) {
    if (el.hidden) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab')    { trapFocus(e, el); }
  });

  return el;
}

/* ---------------------------------------------------------
   SECTION: Modal — open / close
   --------------------------------------------------------- */
function openModal(listing, triggerEl) {
  modalLastFocus = triggerEl || document.activeElement;

  var type = (listing['listing_type'] || 'affordable').trim().toLowerCase();
  document.getElementById('lm-content').innerHTML =
    type === 'mls' ? buildMLSContent(listing) : buildAffordableContent(listing);

  listingModal.hidden = false;
  document.body.classList.add('modal-open');
  document.getElementById('lm-panel').focus();

  initCarousel();
  if (type === 'mls') initMLSForm(listing);
}

function closeModal() {
  listingModal.hidden = true;
  document.body.classList.remove('modal-open');
  if (modalLastFocus) modalLastFocus.focus();
}

function trapFocus(e, container) {
  var focusable = Array.prototype.slice.call(container.querySelectorAll(
    'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
  )).filter(function(el) { return !el.hidden && el.offsetParent !== null; });

  if (!focusable.length) return;
  var first = focusable[0];
  var last  = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

/* ---------------------------------------------------------
   SECTION: Modal content — Affordable listing
   --------------------------------------------------------- */
function buildAffordableContent(l) {
  var name       = l['Property Name'] || 'Property';
  var address    = (l['Address'] || '') + (l['City'] ? ', ' + l['City'] : '');
  var price      = l['Price']  || '';
  var status     = l['Status'] || 'Available';
  var pdfURL     = l['requirements_pdf_url'] || '';

  var badgeClass = status.trim().toLowerCase() === 'available'
    ? 'status-badge--available' : 'status-badge--coming-soon';

  var photos   = getPhotos(l);
  var descHTML = buildDescSections(l);

  return (
    '<div class="lm-header">' +
      '<h2 class="lm-title" id="lm-title">' + escapeHTML(name) + '</h2>' +
      (address ? '<p class="lm-address">' + escapeHTML(address) + '</p>' : '') +
      (price   ? '<p class="lm-price">'   + escapeHTML(price)   + '</p>' : '') +
      '<span class="status-badge ' + badgeClass + '">' + escapeHTML(status) + '</span>' +
    '</div>' +
    buildCarouselHTML(photos, name) +
    descHTML +
    '<div class="lm-actions">' +
      (pdfURL
        ? '<a href="' + escapeHTML(pdfURL) + '" target="_blank" rel="noopener" class="btn btn-secondary">' +
            '<i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Download Requirements PDF' +
          '</a>'
        : '') +
      '<a href="contact.html#buyer-form" class="btn btn-primary">' +
        'Join the Interest List <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
      '</a>' +
    '</div>'
  );
}

/* ---------------------------------------------------------
   SECTION: Modal content — MLS listing
   --------------------------------------------------------- */
function buildMLSContent(l) {
  var name    = l['Property Name'] || 'Property';
  var address = (l['Address'] || '') + (l['City'] ? ', ' + l['City'] : '');
  var price   = l['Price']  || '';
  var status  = l['Status'] || 'Available';

  var badgeClass = status.trim().toLowerCase() === 'available'
    ? 'status-badge--available' : 'status-badge--coming-soon';

  var photos   = getPhotos(l);
  var descHTML = buildDescSections(l);

  return (
    '<div class="lm-header">' +
      '<span class="tag tag--mls" style="margin-bottom:0.5rem;display:inline-block;">MLS Listing</span>' +
      '<h2 class="lm-title" id="lm-title">' + escapeHTML(name) + '</h2>' +
      (address ? '<p class="lm-address">' + escapeHTML(address) + '</p>' : '') +
      (price   ? '<p class="lm-price">'   + escapeHTML(price)   + '</p>' : '') +
      '<span class="status-badge ' + badgeClass + '">' + escapeHTML(status) + '</span>' +
    '</div>' +
    buildCarouselHTML(photos, name) +
    descHTML +
    '<div class="lm-mls-contact">' +
      '<h3 class="lm-mls-contact__heading">Contact About This Property</h3>' +
      '<form id="lm-mls-form" novalidate>' +
        '<div class="form-group">' +
          '<label class="form-label" for="lm-mls-name">Your Name <span aria-hidden="true">*</span></label>' +
          '<input id="lm-mls-name" name="name" type="text" class="form-control" required autocomplete="name">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="lm-mls-email">Email <span aria-hidden="true">*</span></label>' +
          '<input id="lm-mls-email" name="email" type="email" class="form-control" required autocomplete="email">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="lm-mls-phone">Phone</label>' +
          '<input id="lm-mls-phone" name="phone" type="tel" class="form-control" autocomplete="tel">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="lm-mls-msg">Message</label>' +
          '<textarea id="lm-mls-msg" name="message" class="form-control" rows="4"' +
          ' placeholder="I\'m interested in this property\u2026"></textarea>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary" id="lm-mls-submit">' +
          'Send Inquiry <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>' +
        '</button>' +
        '<p id="lm-mls-status" class="lm-mls-status" aria-live="polite"></p>' +
      '</form>' +
    '</div>'
  );
}

/* ---------------------------------------------------------
   SECTION: Carousel helpers
   --------------------------------------------------------- */
function getPhotos(l) {
  var photos = [];
  if (l['Photo URL'])    photos.push(l['Photo URL']);
  if (l['image_url_2'])  photos.push(l['image_url_2']);
  if (l['image_url_3'])  photos.push(l['image_url_3']);
  if (l['image_url_4'])  photos.push(l['image_url_4']);
  return photos;
}

function buildCarouselHTML(photos, name) {
  if (photos.length === 0) {
    return (
      '<div class="lm-carousel lm-carousel--placeholder">' +
        '<i class="fa-solid fa-image" aria-hidden="true"></i>' +
        '<p>Property photos coming soon</p>' +
      '</div>'
    );
  }

  if (photos.length === 1) {
    return (
      '<div class="lm-carousel lm-carousel--single">' +
        '<img src="' + escapeHTML(photos[0]) + '" alt="' + escapeHTML(name) + '" class="lm-carousel__img"' +
        ' onerror="this.closest(\'.lm-carousel\').classList.add(\'lm-carousel--placeholder\');' +
        'this.remove()">' +
      '</div>'
    );
  }

  var slides = photos.map(function(src, i) {
    return (
      '<div class="lm-slide' + (i === 0 ? ' is-active' : '') + '" aria-hidden="' + (i !== 0) + '">' +
        '<img src="' + escapeHTML(src) + '" alt="' + escapeHTML(name) + ' — photo ' + (i + 1) + '"' +
        ' onerror="this.parentElement.style.display=\'none\'">' +
      '</div>'
    );
  }).join('');

  var dots = photos.map(function(_, i) {
    return (
      '<button type="button" class="lm-dot' + (i === 0 ? ' is-active' : '') + '"' +
      ' aria-label="Photo ' + (i + 1) + '" data-slide="' + i + '"></button>'
    );
  }).join('');

  return (
    '<div class="lm-carousel" data-carousel>' +
      '<div class="lm-slides">' + slides + '</div>' +
      '<button type="button" class="lm-arrow lm-arrow--prev" aria-label="Previous photo">' +
        '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>' +
      '</button>' +
      '<button type="button" class="lm-arrow lm-arrow--next" aria-label="Next photo">' +
        '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="lm-dots">' + dots + '</div>' +
    '</div>'
  );
}

function initCarousel() {
  var carousel = document.querySelector('[data-carousel]');
  if (!carousel) return;

  carouselIndex = 0;

  carousel.querySelector('.lm-arrow--prev').addEventListener('click', function() {
    var count = carousel.querySelectorAll('.lm-slide').length;
    goToSlide((carouselIndex - 1 + count) % count);
  });
  carousel.querySelector('.lm-arrow--next').addEventListener('click', function() {
    var count = carousel.querySelectorAll('.lm-slide').length;
    goToSlide((carouselIndex + 1) % count);
  });
  carousel.querySelectorAll('.lm-dot').forEach(function(dot) {
    dot.addEventListener('click', function() {
      goToSlide(parseInt(this.dataset.slide, 10));
    });
  });
}

function goToSlide(n) {
  var slides = document.querySelectorAll('.lm-slide');
  var dots   = document.querySelectorAll('.lm-dot');
  if (!slides.length) return;

  slides[carouselIndex].classList.remove('is-active');
  slides[carouselIndex].setAttribute('aria-hidden', 'true');
  if (dots[carouselIndex]) dots[carouselIndex].classList.remove('is-active');

  carouselIndex = n;
  slides[carouselIndex].classList.add('is-active');
  slides[carouselIndex].setAttribute('aria-hidden', 'false');
  if (dots[carouselIndex]) dots[carouselIndex].classList.add('is-active');
}

/* ---------------------------------------------------------
   SECTION: Description sections (modal body)
   --------------------------------------------------------- */
function buildDescSections(l) {
  var values = [
    l['Description']   || l['description_1'] || '',
    l['description_2'] || '',
    l['description_3'] || '',
    l['description_4'] || '',
    l['description_5'] || ''
  ];

  var html = '';
  values.forEach(function(text, i) {
    if (!text) return;
    html +=
      '<div class="lm-desc-section">' +
        '<h3 class="lm-desc-label">' + escapeHTML(DESC_LABELS[i]) + '</h3>' +
        '<p class="lm-desc-text">' + escapeHTML(text) + '</p>' +
      '</div>';
  });

  return html ? '<div class="lm-descs">' + html + '</div>' : '';
}

/* ---------------------------------------------------------
   SECTION: MLS contact form submission
   --------------------------------------------------------- */
function initMLSForm(listing) {
  var form    = document.getElementById('lm-mls-form');
  var btn     = document.getElementById('lm-mls-submit');
  var statusEl = document.getElementById('lm-mls-status');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    statusEl.textContent = '';

    var payload = {
      form_type:     'mls_contact',
      property_name: listing['Property Name'] || '',
      name:    form.querySelector('[name="name"]').value.trim(),
      email:   form.querySelector('[name="email"]').value.trim(),
      phone:   form.querySelector('[name="phone"]').value.trim(),
      message: form.querySelector('[name="message"]').value.trim()
    };

    fetch(LISTINGS_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        form.innerHTML =
          '<p class="lm-mls-success">' +
            '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ' +
            'Your inquiry has been sent. We\'ll be in touch shortly.' +
          '</p>';
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.innerHTML = 'Send Inquiry <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
      statusEl.textContent = 'Something went wrong. Please try again or email us directly.';
    });
  });
}

/* ---------------------------------------------------------
   SECTION: State messages
   --------------------------------------------------------- */
function showLoadingState() {
  listingsGrid.innerHTML =
    '<div class="listing-status" role="status" aria-live="polite">' +
      '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>' +
      '<p>Loading available properties&hellip;</p>' +
    '</div>';
}

function showErrorState() {
  listingsGrid.innerHTML =
    '<div class="listing-status" role="alert">' +
      '<i class="fa-solid fa-house-circle-exclamation" aria-hidden="true"></i>' +
      '<p>Listings are being updated. Please check back shortly or <a href="contact.html">contact us directly</a>.</p>' +
    '</div>';
}

function showEmptyState() {
  listingsGrid.innerHTML =
    '<div class="listing-status" role="status">' +
      '<i class="fa-solid fa-house" aria-hidden="true"></i>' +
      '<p>No properties are currently listed. Sign up below to be notified when new homes become available.</p>' +
    '</div>';
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
