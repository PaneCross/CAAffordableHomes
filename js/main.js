/* =========================================================
   CA Affordable Homes — main.js
   Navigation, FAQ accordion, general interactions
   ========================================================= */

/* ---------------------------------------------------------
   SECTION: Navigation — Hamburger Toggle
   --------------------------------------------------------- */
(function () {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('nav-mobile');

  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', function () {
    const isOpen = mobileMenu.classList.toggle('is-open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
    // Prevent body scroll when menu is open
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile menu when a link is clicked
  mobileMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      mobileMenu.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Close menu on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
      mobileMenu.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      hamburger.focus();
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', function (e) {
    if (
      mobileMenu.classList.contains('is-open') &&
      !mobileMenu.contains(e.target) &&
      !hamburger.contains(e.target)
    ) {
      mobileMenu.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
})();

/* ---------------------------------------------------------
   SECTION: Active Navigation Link
   Sets the "active" class on the current page's nav link
   --------------------------------------------------------- */
(function () {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(function (link) {
    const linkPath = link.getAttribute('href');
    if (!linkPath) return;

    const linkFile = linkPath.split('/').pop();

    if (
      linkFile === currentPath ||
      (currentPath === '' && linkFile === 'index.html') ||
      (currentPath === 'index.html' && linkFile === 'index.html')
    ) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
})();

/* ---------------------------------------------------------
   SECTION: FAQ Accordion
   --------------------------------------------------------- */
(function () {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    if (!question || !answer) return;

    question.addEventListener('click', function () {
      const isExpanded = question.getAttribute('aria-expanded') === 'true';

      // Close all other items (accordion behavior)
      faqItems.forEach(function (otherItem) {
        if (otherItem !== item) {
          const otherQuestion = otherItem.querySelector('.faq-question');
          const otherAnswer = otherItem.querySelector('.faq-answer');
          if (otherQuestion && otherAnswer) {
            otherQuestion.setAttribute('aria-expanded', 'false');
            otherAnswer.classList.remove('is-open');
          }
        }
      });

      // Toggle current item
      const newExpanded = !isExpanded;
      question.setAttribute('aria-expanded', String(newExpanded));
      answer.classList.toggle('is-open', newExpanded);
    });
  });
})();

/* ---------------------------------------------------------
   SECTION: Smooth Scroll for anchor links
   --------------------------------------------------------- */
(function () {
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const navHeight = document.querySelector('.site-nav')
        ? document.querySelector('.site-nav').offsetHeight
        : 0;

      const targetTop =
        target.getBoundingClientRect().top + window.pageYOffset - navHeight - 24;

      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  });
})();

/* ---------------------------------------------------------
   SECTION: Pre-fill Contact Form from URL Params
   Allows "Learn More / Pre-Screen" property card links to
   pre-populate the subject/property field on contact.html
   --------------------------------------------------------- */
(function () {
  const params = new URLSearchParams(window.location.search);
  const property = params.get('property');

  if (property) {
    // Try to find and populate an area-of-interest or message field
    const areaField = document.getElementById('area-of-interest');
    const messageField = document.getElementById('message');
    const subjectField = document.getElementById('subject');

    if (areaField) {
      areaField.value = property;
    }
    if (subjectField) {
      subjectField.value = 'Inquiry about: ' + property;
    }
    if (messageField && !messageField.value) {
      messageField.value = 'I am interested in learning more about: ' + property;
    }

    // Scroll to the buyer form if present
    const buyerForm = document.getElementById('buyer-form');
    if (buyerForm) {
      setTimeout(function () {
        buyerForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }
})();

/* ---------------------------------------------------------
   SECTION: Page Transition — store nav position before navigating
   (enter animation is CSS only; no leave animation to avoid white flash)
   --------------------------------------------------------- */
(function () {
  function isInternal(href) {
    if (!href) return false;
    if (href.startsWith('#')) return false;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return false;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    return true;
  }

  document.querySelectorAll('a[href]').forEach(function (link) {
    const href = link.getAttribute('href');
    if (!isInternal(href)) return;
    if (link.getAttribute('target') === '_blank') return;

    link.addEventListener('click', function (e) {
      e.preventDefault();

      // Store the current active nav link so the next page can slide from here
      const currentActive = document.querySelector('.nav-links a.active');
      if (currentActive) {
        sessionStorage.setItem('prevNavHref', currentActive.getAttribute('href'));
      }

      window.location.href = href;
    });
  });
})();

/* ---------------------------------------------------------
   SECTION: Nav Indicator — sliding active-page underline bar
   --------------------------------------------------------- */
(function () {
  const navInner = document.querySelector('.nav-inner');
  const navLinksEl = document.querySelector('.nav-links');
  if (!navInner || !navLinksEl) return;

  // Only runs on desktop where nav-links are visible
  if (window.innerWidth < 900) return;

  const activeLink = navLinksEl.querySelector('a.active');
  if (!activeLink) return;

  const indicator = document.createElement('div');
  indicator.className = 'nav-indicator';
  navInner.appendChild(indicator);

  function setPos(link) {
    const navRect = navInner.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const pl = parseFloat(getComputedStyle(link).paddingLeft);
    const pr = parseFloat(getComputedStyle(link).paddingRight);
    indicator.style.left = (linkRect.left - navRect.left + pl) + 'px';
    indicator.style.width = (linkRect.width - pl - pr) + 'px';
  }

  const SLIDE_TRANSITION = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
  const prevHref = sessionStorage.getItem('prevNavHref');
  sessionStorage.removeItem('prevNavHref');

  const prevLink = prevHref ? navLinksEl.querySelector('a[href="' + prevHref + '"]') : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prevLink && prevLink !== activeLink && !reducedMotion) {
    // Place indicator at previous page's position instantly, then slide to current
    indicator.style.transition = 'none';
    setPos(prevLink);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        indicator.style.transition = SLIDE_TRANSITION;
        setPos(activeLink);
      });
    });
  } else {
    // No previous context — just place without animation
    indicator.style.transition = 'none';
    setPos(activeLink);
  }
})();
