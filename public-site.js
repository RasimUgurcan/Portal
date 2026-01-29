// DOMContentLoaded ile sayfa yÃ¼klendikten sonra Ã§alÄ±ÅŸtÄ±r
(function () {
  'use strict';

  // Sayfa yÃ¼klendiÄŸinde Ã§alÄ±ÅŸtÄ±r
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Main elementini hemen gÃ¶rÃ¼nÃ¼r yap
    const main = document.querySelector('main');
    if (main) {
      main.classList.add('is-visible');
    }

    initNavToggle();
    initYear();
    initContactForm();
    initSmoothAnchors();
    initCollapsibleCards();
    initCardNavigation();
    initFaqFilters();
    initPage();
  }

  function initNavToggle() {
    const navToggle = document.getElementById('navToggle');
    const mainNav = document.getElementById('mainNav');

    if (navToggle && mainNav) {
      navToggle.addEventListener('click', () => {
        mainNav.classList.toggle('open');
      });
    }
  }

  function initYear() {
    const year = document.getElementById('year');
    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  function initContactForm() {
    const form = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');
    const formSuccess = document.getElementById('formSuccess');
    const submitButton = document.getElementById('submitButton');
    const newRequestBtn = document.getElementById('newRequestBtn');

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (formStatus) {
          formStatus.textContent = 'GÃ¶nderiliyor...';
          formStatus.classList.remove('success', 'error');
        }
        if (submitButton) {
          submitButton.classList.add('loading');
          submitButton.disabled = true;
        }

        const backendUrl = form.dataset.backendUrl || '';
        if (!backendUrl) {
          if (formStatus) {
            formStatus.textContent = 'Backend API adresi ayarlanmadÄ±.';
            formStatus.classList.add('error');
          }
          if (submitButton) {
            submitButton.classList.remove('loading');
            submitButton.disabled = false;
          }
          return;
        }

        const formData = new FormData(form);
        const name = formData.get('fullName') || '-';
        const email = formData.get('email') || '-';
        const company = formData.get('company') || '-';
        const message = formData.get('message') || '-';

        const body = [
          `Ad Soyad: ${name}`,
          `E-posta: ${email}`,
          `Åirket / Kurum: ${company}`,
          'Mesaj:',
          message
        ].join('\n');

        try {
          const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: 'danisman@eysglobal.com.tr',
              subject: 'EYS Global Teklif Formu',
              body,
              fromName: name,
              fromEmail: email
            })
          });

          if (!response.ok) {
            throw new Error('Form gÃ¶nderimi baÅŸarÄ±sÄ±z.');
          }

          if (formStatus) {
            formStatus.textContent = '';
          }
          if (formSuccess) {
            formSuccess.hidden = false;
          }

          form.querySelectorAll('label, button, .form-note').forEach((el) => {
            el.style.display = 'none';
          });
        } catch (error) {
          if (formStatus) {
            formStatus.textContent = 'GÃ¶nderim baÅŸarÄ±sÄ±z. LÃ¼tfen tekrar deneyin.';
            formStatus.classList.add('error');
          }
          if (submitButton) {
            submitButton.classList.remove('loading');
            submitButton.disabled = false;
          }
        }
      });
    }

    if (newRequestBtn && form) {
      newRequestBtn.addEventListener('click', () => {
        form.reset();
        formSuccess.hidden = true;
        if (formStatus) {
          formStatus.textContent = '';
        }
        form.querySelectorAll('label, button, .form-note').forEach((el) => {
          el.style.display = '';
        });
        if (submitButton) {
          submitButton.classList.remove('loading');
          submitButton.disabled = false;
        }
      });
    }
  }

  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
          mainNav.classList.remove('open');
        }
      });
    });
  }

  function initCollapsibleCards() {
    document.querySelectorAll('.card[data-collapsible="true"]').forEach(card => {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      const slug = getCardSlug(card);
      if (slug) {
        card.setAttribute('data-slug', slug);
      }
    });
  }

  function getCardSlug(card) {
    const cardTitle = card.querySelector('h3');
    if (cardTitle) {
      const titleText = cardTitle.textContent.trim();
      return titleText
        .toLowerCase()
        .replace(/ÅŸ/g, 's')
        .replace(/ÄŸ/g, 'g')
        .replace(/Ã¼/g, 'u')
        .replace(/Ã¶/g, 'o')
        .replace(/Ã§/g, 'c')
        .replace(/Ä±/g, 'i')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    return null;
  }

  function showCardDetail(slug) {
    const main = document.querySelector('main');
    if (!main) return;

    const cards = main.querySelectorAll('.card[data-collapsible="true"]');
    if (cards.length === 0) return;

    const targetCard = Array.from(cards).find(card => {
      const cardSlug = getCardSlug(card);
      return cardSlug === slug;
    });

    if (!targetCard) return;

    const section = main.querySelector('.section');
    if (!section) return;

    const cardTitle = targetCard.querySelector('h3');
    const cardDetail = targetCard.querySelector('.card-detail');

    if (!cardTitle || !cardDetail) return;

    // Hide all cards
    cards.forEach(card => {
      card.style.display = 'none';
    });

    // Create detail view
    const detailHTML = `
    <div class="service-detail">
      <button class="btn-back" onclick="goBackToCards()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Geri DÃ¶n
      </button>
      <div class="service-content">
        <h1>${cardTitle.textContent}</h1>
        ${cardDetail.innerHTML}
      </div>
    </div>
  `;

    section.innerHTML = detailHTML;

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBackToCards() {
    const currentPath = window.location.pathname;
    window.history.pushState({}, '', currentPath);
    loadPage(new URL(currentPath, window.location.origin), false);
  }

  window.goBackToCards = goBackToCards;

  function initCardNavigation() {
    // Check if there's a hash in URL
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setTimeout(() => {
        showCardDetail(hash);
      }, 100);
    }
  }

  function initPage() {
    initYear();
    initContactForm();
    initSmoothAnchors();
    initCollapsibleCards();
    initCardNavigation();
    updateActiveNavLink();
  }

  function updateActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.main-nav a');
    const navButtons = document.querySelectorAll('.main-nav .nav-link');

    // Reset all
    navLinks.forEach(link => link.classList.remove('active'));
    navButtons.forEach(btn => btn.classList.remove('active'));

    // Find active link
    let activeLink = null;

    // Normalize path by removing trailing slash for comparison
    const normalizedPath = currentPath.endsWith('/') && currentPath.length > 1
      ? currentPath.slice(0, -1)
      : currentPath;

    // Exact match first (checking both raw and normalized)
    activeLink = Array.from(navLinks).find(link => {
      const href = link.getAttribute('href');
      return href === currentPath || href === normalizedPath;
    });

    if (activeLink) {
      activeLink.classList.add('active');

      // Handle parent submenu
      const submenu = activeLink.closest('.submenu');
      if (submenu) {
        const parentItem = submenu.closest('.nav-item');
        if (parentItem) {
          const parentBtn = parentItem.querySelector('.nav-link');
          if (parentBtn) {
            parentBtn.classList.add('active');
          }
        }
      }
    }
  }

  function shouldHandleNavigation(url) {
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.startsWith('/portal')) return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (url.pathname.startsWith('/assets/')) return false;
    return true;
  }

  async function loadPage(url, pushState = true) {
    const main = document.querySelector('main');
    if (!main) {
      window.location.href = url.href;
      return;
    }

    // CLS Ã¶nleme: Ä°Ã§eriÄŸi deÄŸiÅŸtirmeden Ã¶nce yÃ¼ksekliÄŸi koru
    const currentHeight = main.offsetHeight;
    main.style.minHeight = `${currentHeight}px`;

    // Animasyonu kaldÄ±r - direkt iÃ§eriÄŸi deÄŸiÅŸtir
    try {
      const response = await fetch(url.href, { headers: { 'X-Requested-With': 'fetch' }, cache: 'no-cache' });
      if (!response.ok) throw new Error('Fetch failed');
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const nextMain = doc.querySelector('main');
      const nextTitle = doc.querySelector('title');

      if (!nextMain) throw new Error('No main found');

      main.innerHTML = nextMain.innerHTML;
      if (nextTitle) {
        document.title = nextTitle.textContent;
      }
      if (pushState) {
        window.history.pushState({}, '', url.href);
      }
      initPage();
      // Animasyon olmadan direkt gÃ¶rÃ¼nÃ¼r yap
      main.classList.add('is-visible');

      // CLS Ã¶nleme: Yeni iÃ§erik yÃ¼klendikten sonra min-height'i kaldÄ±r
      requestAnimationFrame(() => {
        main.style.minHeight = '';
      });

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      main.style.minHeight = '';
      window.location.href = url.href;
    }
  }

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.card[data-collapsible="true"]');
    if (card) {
      event.preventDefault();
      const slug = getCardSlug(card);
      if (slug) {
        const currentPath = window.location.pathname;
        const hashUrl = `${currentPath}#${slug}`;
        window.history.pushState({}, '', hashUrl);
        showCardDetail(slug);
      }
      return;
    }

    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || link.target === '_blank') {
      return;
    }
    const url = new URL(href, window.location.origin);
    if (!shouldHandleNavigation(url)) return;
    event.preventDefault();
    loadPage(url, true);
  });

  function initPage() {
    initYear();
    initContactForm();
    initSmoothAnchors();
    initCollapsibleCards();
  }

  function shouldHandleNavigation(url) {
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.startsWith('/portal')) return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (url.pathname.startsWith('/assets/')) return false;
    return true;
  }

  async function loadPage(url, pushState = true) {
    const main = document.querySelector('main');
    if (!main) {
      window.location.href = url.href;
      return;
    }

    // CLS Ã¶nleme: Ä°Ã§eriÄŸi deÄŸiÅŸtirmeden Ã¶nce yÃ¼ksekliÄŸi koru
    const currentHeight = main.offsetHeight;
    main.style.minHeight = `${currentHeight}px`;

    // Animasyonu kaldÄ±r - direkt iÃ§eriÄŸi deÄŸiÅŸtir
    try {
      const response = await fetch(url.href, { headers: { 'X-Requested-With': 'fetch' }, cache: 'no-cache' });
      if (!response.ok) throw new Error('Fetch failed');
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const nextMain = doc.querySelector('main');
      const nextTitle = doc.querySelector('title');

      if (!nextMain) throw new Error('No main found');

      main.innerHTML = nextMain.innerHTML;
      if (nextTitle) {
        document.title = nextTitle.textContent;
      }
      if (pushState) {
        window.history.pushState({}, '', url.href);
      }
      initPage();
      // Animasyon olmadan direkt gÃ¶rÃ¼nÃ¼r yap
      main.classList.add('is-visible');

      // CLS Ã¶nleme: Yeni iÃ§erik yÃ¼klendikten sonra min-height'i kaldÄ±r
      requestAnimationFrame(() => {
        main.style.minHeight = '';
      });

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      main.style.minHeight = '';
      window.location.href = url.href;
    }
  }

  window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '');
    const main = document.querySelector('main');
    if (hash && main && main.querySelector('.card[data-collapsible="true"]')) {
      showCardDetail(hash);
    } else if (!hash) {
      const currentPath = window.location.pathname;
      loadPage(new URL(currentPath, window.location.origin), false);
    } else {
      loadPage(new URL(window.location.href), false);
    }
  });

  window.addEventListener('load', () => {
    const main = document.querySelector('main');
    if (main) {
      main.classList.add('is-visible');
    }
    initPage();
  });

  // Submenus open on hover (desktop) and stay visible in mobile layout

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
        mainNav.classList.remove('open');
      }
    });
  });

  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  const form = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  const formSuccess = document.getElementById('formSuccess');
  const submitButton = document.getElementById('submitButton');
  const newRequestBtn = document.getElementById('newRequestBtn');

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (formStatus) {
        formStatus.textContent = 'G\u00f6nderiliyor...';
        formStatus.classList.remove('success', 'error');
      }
      if (submitButton) {
        submitButton.classList.add('loading');
        submitButton.disabled = true;
      }

      const backendUrl = form.dataset.backendUrl || '';
      if (!backendUrl) {
        if (formStatus) {
          formStatus.textContent = 'Backend API adresi ayarlanmad\u0131.';
          formStatus.classList.add('error');
        }
        if (submitButton) {
          submitButton.classList.remove('loading');
          submitButton.disabled = false;
        }
        return;
      }

      const formData = new FormData(form);
      const name = formData.get('fullName') || '-';
      const email = formData.get('email') || '-';
      const company = formData.get('company') || '-';
      const message = formData.get('message') || '-';

      const body = [
        `Ad Soyad: ${name}`,
        `E-posta: ${email}`,
        `Åirket / Kurum: ${company}`,
        'Mesaj:',
        message
      ].join('\n');

      try {
        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'danisman@eysglobal.com.tr',
            subject: 'EYS Global Teklif Formu',
            body,
            fromName: name,
            fromEmail: email
          })
        });

        if (!response.ok) {
          throw new Error('Form gÃ¶nderimi baÅŸarÄ±sÄ±z.');
        }

        if (formStatus) {
          formStatus.textContent = '';
        }
        if (formSuccess) {
          formSuccess.hidden = false;
        }

        form.querySelectorAll('label, button, .form-note').forEach((el) => {
          el.style.display = 'none';
        });
      } catch (error) {
        if (formStatus) {
          formStatus.textContent = 'G\u00f6nderim ba\u015far\u0131s\u0131z. L\u00fctfen tekrar deneyin.';
          formStatus.classList.add('error');
        }
        if (submitButton) {
          submitButton.classList.remove('loading');
          submitButton.disabled = false;
        }
      }
    });
  }

  if (newRequestBtn && form) {
    newRequestBtn.addEventListener('click', () => {
      form.reset();
      formSuccess.hidden = true;
      if (formStatus) {
        formStatus.textContent = '';
      }
      form.querySelectorAll('label, button, .form-note').forEach((el) => {
        el.style.display = '';
      });
      if (submitButton) {
        submitButton.classList.remove('loading');
        submitButton.disabled = false;
      }
    });
  }

  function initFaqFilters() {
    console.log('[FAQ Filters] Initializing...');
    const filterButtons = document.querySelectorAll('.faq-filter-btn');
    const faqItems = document.querySelectorAll('.faq details');

    console.log('[FAQ Filters] Found', filterButtons.length, 'buttons');
    console.log('[FAQ Filters] Found', faqItems.length, 'FAQ items');

    if (filterButtons.length === 0) {
      console.warn('[FAQ Filters] No filter buttons found!');
      return;
    }

    filterButtons.forEach((btn, index) => {
      console.log(`[FAQ Filters] Adding listener to button ${index}:`, btn.getAttribute('data-filter'));
      btn.addEventListener('click', () => {
        console.log('[FAQ Filters] Button clicked:', btn.getAttribute('data-filter'));

        // Active buton stilini gÃ¼ncelle
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');

        // FAQ maddelerini filtrele
        faqItems.forEach(item => {
          const category = item.getAttribute('data-category');
          if (filter === 'all' || category === filter) {
            item.style.display = 'block';
            // Animasyon ekle
            item.style.animation = 'none';
            item.offsetHeight; // Reflow
            item.style.animation = 'fadeInUp 0.4s ease forwards';
          } else {
            item.style.display = 'none';
          }
        });

        console.log(`[FAQ Filters] Filter applied: ${filter}`);
      });
    });

    console.log('[FAQ Filters] Initialization complete!');
  }

})();
