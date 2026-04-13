/* =========================================================
   CA Affordable Homes - testimonials.js
   Fetches active testimonials from Supabase and renders them.
   4 or fewer entries: static grid
   More than 4 entries: auto-rotating carousel with nav arrows
   ========================================================= */

var SUPABASE_URL = 'https://monybdfujogcyseyjgfx.supabase.co'
var SUPABASE_KEY = 'sb_publishable_Y36wJc0oJ_0f9JOf3co6BA_Re749E7U'

/* ---------------------------------------------------------
   UTILITY
   --------------------------------------------------------- */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------------------------------------------------
   RENDER - STATIC GRID (4 or fewer testimonials)
   --------------------------------------------------------- */
function renderStatic(container, items) {
  var html = '<div class="testimonials-grid">';
  items.forEach(function (t) {
    html += '<div class="testimonial-card">';
    html += '<blockquote>\u201c' + escapeHTML(t.quote) + '\u201d</blockquote>';
    html += '<cite>' + escapeHTML(t.attribution) + '</cite>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

/* ---------------------------------------------------------
   RENDER - CAROUSEL (more than 4 testimonials)
   --------------------------------------------------------- */
function renderCarousel(container, items) {
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
  html += '</div>';
  html += '</div>';
  html += '<div class="carousel-controls">';
  html += '<button class="carousel-btn carousel-btn--prev" aria-label="Previous testimonials"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>';
  html += '<div class="carousel-dots" role="tablist" aria-label="Testimonial pages"></div>';
  html += '<button class="carousel-btn carousel-btn--next" aria-label="Next testimonials"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>';
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;
  initCarousel(container, items);
}

function initCarousel(container, items) {
  var track     = container.querySelector('.carousel-track');
  var prevBtn   = container.querySelector('.carousel-btn--prev');
  var nextBtn   = container.querySelector('.carousel-btn--next');
  var dotsEl    = container.querySelector('.carousel-dots');
  var carousel  = container.querySelector('.testimonials-carousel');

  var currentPage = 0;
  var autoTimer   = null;
  var isHovering  = false;

  function getVisible() {
    if (window.innerWidth >= 900) return Math.min(4, items.length);
    if (window.innerWidth >= 560) return Math.min(2, items.length);
    return 1;
  }

  function getPageCount() {
    return Math.ceil(items.length / getVisible());
  }

  function pageStartIndex(page) {
    var visible = getVisible();
    return Math.min(page * visible, items.length - visible);
  }

  function setSlideWidths() {
    var visible = getVisible();
    track.querySelectorAll('.carousel-slide').forEach(function (slide) {
      slide.style.flex = '0 0 ' + (100 / visible) + '%';
    });
  }

  function buildDots() {
    dotsEl.innerHTML = '';
    var pages = getPageCount();
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
    dotsEl.querySelectorAll('.carousel-dot').forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === currentPage);
      dot.setAttribute('aria-selected', i === currentPage ? 'true' : 'false');
    });
  }

  function goToPage(page) {
    var pages = getPageCount();
    if (page >= pages) page = 0;
    if (page < 0)      page = pages - 1;
    currentPage = page;
    var visible = getVisible();
    var pct = (100 / visible) * pageStartIndex(page);
    track.style.transform = 'translateX(-' + pct + '%)';
    updateDots();
  }

  function setup() {
    setSlideWidths();
    buildDots();
    if (currentPage >= getPageCount()) currentPage = 0;
    goToPage(currentPage);
  }

  dotsEl.addEventListener('click', function (e) {
    var dot = e.target.closest('.carousel-dot');
    if (!dot) return;
    goToPage(parseInt(dot.getAttribute('data-page'), 10));
  });

  prevBtn.addEventListener('click', function () { goToPage(currentPage - 1); });
  nextBtn.addEventListener('click', function () { goToPage(currentPage + 1); });

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(function () {
      if (!isHovering) goToPage(currentPage + 1);
    }, 5000);
  }

  carousel.addEventListener('mouseenter', function () { isHovering = true; });
  carousel.addEventListener('mouseleave', function () { isHovering = false; });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 150);
  });

  setup();
  startAuto();
}

/* ---------------------------------------------------------
   RENDER ROUTER
   --------------------------------------------------------- */
function renderTestimonialsSection(items) {
  var container = document.getElementById('testimonials-container');
  var section   = document.getElementById('testimonials-section');
  if (!container) return;

  if (items.length === 0) return; // keep section hidden

  if (section) section.style.display = '';

  if (items.length <= 4) {
    renderStatic(container, items);
  } else {
    renderCarousel(container, items);
  }
}

/* ---------------------------------------------------------
   INIT - fetch active testimonials from Supabase
   --------------------------------------------------------- */
(function () {
  var container = document.getElementById('testimonials-container');
  if (!container) return;

  fetch(SUPABASE_URL + '/rest/v1/testimonials?active=eq.true&order=id.asc&select=*', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (rows) {
      var items = (rows || []).map(function (r) {
        return {
          quote:       (r.quote || '').trim(),
          attribution: ([r.name, r.role].filter(Boolean).join(', ')) || 'Client'
        };
      }).filter(function (t) { return t.quote; });

      renderTestimonialsSection(items);
    })
    .catch(function () {
      /* Fail silently - section stays hidden if fetch fails */
    });
})();
