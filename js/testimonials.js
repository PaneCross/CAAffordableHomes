/* =========================================================
   CA Affordable Homes — testimonials.js
   Dynamic testimonials from Google Sheets CSV.
   ≤4 active entries → static grid
   >4 active entries → auto-rotating carousel with nav arrows
   ========================================================= */

/* ---------------------------------------------------------
   CONFIGURATION
   Paste the published CSV URL from your Google Sheet here.
   Leave as '' to always use the static sample testimonials below.
   --------------------------------------------------------- */
var TESTIMONIALS_CSV_URL = '';

/* ---------------------------------------------------------
   STATIC FALLBACK TESTIMONIALS
   These are shown when no CSV URL is configured, or as a
   fallback if the sheet cannot be fetched.
   --------------------------------------------------------- */
var STATIC_TESTIMONIALS = [
  {
    quote: "Before finding this site, I didn't think I qualified for anything. The pre-screening process was simple, and I finally understood what I could realistically afford. It gave me confidence to move forward.",
    attribution: 'First-Time Buyer'
  },
  {
    quote: "The breakdown of monthly costs and debt ratios was extremely helpful. There was no pressure, just clear information. That made all the difference.",
    attribution: 'Affordable Housing Buyer'
  },
  {
    quote: "We needed a better way to identify qualified buyers for our affordable housing units. The structured screening process saved us time and ensured we were working with eligible applicants.",
    attribution: 'Developer Partner'
  },
  {
    quote: "The transparency and organization of the buyer intake process helped streamline our affordable housing program. It's a model we'd recommend to any municipality.",
    attribution: 'Municipal Partner'
  }
];

/* ---------------------------------------------------------
   CSV PARSER
   --------------------------------------------------------- */
function parseCSVLine(line) {
  var result = [];
  var inQuote = false;
  var cell = '';
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (c === ',' && !inQuote) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell);
  return result;
}

function parseCSV(text) {
  var lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  var headers = parseCSVLine(lines[0]).map(function (h) {
    return h.trim().replace(/^"|"$/g, '');
  });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = parseCSVLine(lines[i]);
    if (!cols.length) continue;
    var obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = (cols[idx] || '').trim().replace(/^"|"$/g, '');
    });
    rows.push(obj);
  }
  return rows;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------------------------------------------------
   RENDER — STATIC GRID (≤4 testimonials)
   --------------------------------------------------------- */
function renderStatic(container, noteEl, items) {
  var html = '<div class="testimonials-grid">';
  items.forEach(function (t) {
    html += '<div class="testimonial-card">';
    html += '<blockquote>\u201c' + escapeHTML(t.quote) + '\u201d</blockquote>';
    html += '<cite>' + escapeHTML(t.attribution) + '</cite>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  if (noteEl) noteEl.style.display = TESTIMONIALS_CSV_URL ? 'none' : '';
}

/* ---------------------------------------------------------
   RENDER — CAROUSEL (>4 testimonials)
   --------------------------------------------------------- */
function renderCarousel(container, noteEl, items) {
  if (noteEl) noteEl.style.display = 'none';

  var html = '<div class="testimonials-carousel" aria-label="Testimonials carousel">';
  html += '<div class="carousel-track-wrapper">';
  html += '<div class="carousel-track">';
  items.forEach(function (t, idx) {
    html += '<div class="carousel-slide" aria-label="Testimonial ' + (idx + 1) + ' of ' + items.length + '">';
    html += '<div class="testimonial-card">';
    html += '<blockquote>\u201c' + escapeHTML(t.quote) + '\u201d</blockquote>';
    html += '<cite>' + escapeHTML(t.attribution) + '</cite>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>'; /* .carousel-track */
  html += '</div>'; /* .carousel-track-wrapper */
  html += '<div class="carousel-controls">';
  html += '<button class="carousel-btn carousel-btn--prev" aria-label="Previous testimonials"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>';
  html += '<div class="carousel-dots" role="tablist" aria-label="Testimonial pages"></div>';
  html += '<button class="carousel-btn carousel-btn--next" aria-label="Next testimonials"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>';
  html += '</div>'; /* .carousel-controls */
  html += '</div>'; /* .testimonials-carousel */

  container.innerHTML = html;
  initCarousel(container, items);
}

function initCarousel(container, items) {
  var track     = container.querySelector('.carousel-track');
  var prevBtn   = container.querySelector('.carousel-btn--prev');
  var nextBtn   = container.querySelector('.carousel-btn--next');
  var dotsEl    = container.querySelector('.carousel-dots');
  var carousel  = container.querySelector('.testimonials-carousel');

  var currentIndex = 0;
  var autoTimer    = null;
  var isHovering   = false;

  function getVisible() {
    if (window.innerWidth >= 900) return Math.min(4, items.length);
    if (window.innerWidth >= 560) return Math.min(2, items.length);
    return 1;
  }

  function setSlideWidths() {
    var visible = getVisible();
    var slides = track.querySelectorAll('.carousel-slide');
    slides.forEach(function (slide) {
      slide.style.flex = '0 0 ' + (100 / visible) + '%';
    });
  }

  function buildDots() {
    dotsEl.innerHTML = '';
    var visible = getVisible();
    var pages = Math.ceil(items.length / visible);
    for (var i = 0; i < pages; i++) {
      var dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Page ' + (i + 1));
      dot.setAttribute('data-page', String(i));
      dotsEl.appendChild(dot);
    }
  }

  function updateDots() {
    var visible = getVisible();
    var activePage = Math.floor(currentIndex / visible);
    dotsEl.querySelectorAll('.carousel-dot').forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === activePage);
      dot.setAttribute('aria-selected', i === activePage ? 'true' : 'false');
    });
  }

  function goTo(index) {
    var visible = getVisible();
    var maxIndex = items.length - visible;
    if (index > maxIndex) index = 0;
    if (index < 0) index = maxIndex;
    currentIndex = index;
    var pct = (100 / visible) * currentIndex;
    track.style.transform = 'translateX(-' + pct + '%)';
    updateDots();
  }

  function setup() {
    setSlideWidths();
    buildDots();
    /* Re-clamp index after resize */
    var visible = getVisible();
    if (currentIndex > items.length - visible) currentIndex = 0;
    goTo(currentIndex);
  }

  /* Dot navigation */
  dotsEl.addEventListener('click', function (e) {
    var dot = e.target.closest('.carousel-dot');
    if (!dot) return;
    var visible = getVisible();
    goTo(parseInt(dot.getAttribute('data-page'), 10) * visible);
  });

  prevBtn.addEventListener('click', function () { goTo(currentIndex - getVisible()); });
  nextBtn.addEventListener('click', function () { goTo(currentIndex + getVisible()); });

  /* Auto-advance every 5 s, pause on hover */
  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(function () {
      if (!isHovering) goTo(currentIndex + getVisible());
    }, 5000);
  }

  carousel.addEventListener('mouseenter', function () { isHovering = true; });
  carousel.addEventListener('mouseleave', function () { isHovering = false; });

  /* Debounced resize */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 150);
  });

  setup();
  startAuto();
}

/* ---------------------------------------------------------
   MAIN RENDER ROUTER
   --------------------------------------------------------- */
function renderTestimonials(items) {
  var container = document.getElementById('testimonials-container');
  var noteEl    = document.getElementById('testimonials-note');
  if (!container) return;
  if (items.length <= 4) {
    renderStatic(container, noteEl, items);
  } else {
    renderCarousel(container, noteEl, items);
  }
}

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
(function () {
  if (!document.getElementById('testimonials-container')) return;

  /* No CSV URL — use static samples immediately */
  if (!TESTIMONIALS_CSV_URL) {
    renderTestimonials(STATIC_TESTIMONIALS);
    return;
  }

  /* Fetch from Google Sheets */
  fetch(TESTIMONIALS_CSV_URL)
    .then(function (res) { return res.text(); })
    .then(function (text) {
      var rows = parseCSV(text);
      var active = rows
        .filter(function (r) {
          return (r['Status'] || r['status'] || '').toLowerCase() === 'active';
        })
        .map(function (r) {
          return {
            quote:       r['Quote']       || r['quote']       || '',
            attribution: r['Attribution'] || r['attribution'] || ''
          };
        })
        .filter(function (t) { return t.quote; });

      renderTestimonials(active.length ? active : STATIC_TESTIMONIALS);
    })
    .catch(function () {
      renderTestimonials(STATIC_TESTIMONIALS);
    });
})();
