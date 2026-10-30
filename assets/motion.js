/* ==========================================================
   BarberHub POS — Motion, Responsive & Persistent Shell Router
   Single-Page Partial Navigation with Zero Flickering
   ========================================================== */
(function () {
  var root = document.documentElement;
  // Block transitions during first paint so late-injected styles don't jump
  root.classList.add('bh-preload');
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove('bh-preload'); });
    });
  });

  var AUTH_PAGES = ['dashboard.html', 'cashier.html', 'management.html', 'history.html', 'settings.html'];

  function updateActiveSidebar(pageName) {
    var page = (pageName || 'dashboard.html').toLowerCase();
    document.querySelectorAll('aside nav a, aside div a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      var icon = a.querySelector('.material-symbols-outlined');
      if (href === page) {
        a.setAttribute('aria-current', 'page');
        a.style.backgroundColor = '#FFF0E0';
        a.style.color = '#FF7A00';
        a.classList.remove('text-[#737373]', 'text-charcoal-700');
        if (icon) {
          icon.style.color = '#FF7A00';
          icon.classList.remove('text-charcoal-500');
        }
      } else if (AUTH_PAGES.indexOf(href) !== -1) {
        a.removeAttribute('aria-current');
        a.style.backgroundColor = '';
        a.style.color = '';
        a.classList.add('text-[#737373]');
        if (icon) {
          icon.style.color = '';
          icon.classList.remove('fill');
        }
      }
    });
  }

  // 2. Responsive Mobile Drawer Management
  function getDrawerElements() {
    return {
      aside: document.querySelector('aside'),
      backdrop: document.getElementById('sidebar-backdrop'),
      menuBtn: document.getElementById('mobile-menu-btn'),
      closeBtn: document.getElementById('sidebar-close-btn')
    };
  }

  function openDrawer() {
    var els = getDrawerElements();
    if (!els.aside) return;
    els.aside.classList.remove('-translate-x-full');
    els.aside.classList.add('translate-x-0', 'shadow-2xl');
    if (els.backdrop) {
      els.backdrop.classList.remove('hidden');
      requestAnimationFrame(function () {
        els.backdrop.classList.remove('opacity-0');
        els.backdrop.classList.add('opacity-100');
      });
    }
    document.body.classList.add('overflow-hidden', 'lg:overflow-auto');
  }

  function closeDrawer() {
    var els = getDrawerElements();
    if (!els.aside) return;
    if (window.innerWidth < 1024) {
      els.aside.classList.add('-translate-x-full');
      els.aside.classList.remove('translate-x-0', 'shadow-2xl');
      if (els.backdrop) {
        els.backdrop.classList.remove('opacity-100');
        els.backdrop.classList.add('opacity-0');
        setTimeout(function () {
          els.backdrop.classList.add('hidden');
        }, 200);
      }
      document.body.classList.remove('overflow-hidden', 'lg:overflow-auto');
    }
  }

  function bindDrawerEvents() {
    var els = getDrawerElements();
    if (els.menuBtn && !els.menuBtn._bhBound) {
      els.menuBtn._bhBound = true;
      els.menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openDrawer();
      });
    }
    if (els.closeBtn && !els.closeBtn._bhBound) {
      els.closeBtn._bhBound = true;
      els.closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeDrawer();
      });
    }
    if (els.backdrop && !els.backdrop._bhBound) {
      els.backdrop._bhBound = true;
      els.backdrop.addEventListener('click', closeDrawer);
    }
  }

  // 3. Persistent Shell Router (Seamless Partial Navigation)
  var isNavigating = false;

  async function navigateTo(targetUrl, pushState) {
    if (typeof pushState === 'undefined') pushState = true;
    if (isNavigating) return;

    var cleanUrl = targetUrl.split('?')[0].split('#')[0];
    var targetPage = (cleanUrl.split('/').pop() || 'dashboard.html').toLowerCase();
    var currentPage = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

    // Same page check
    if (targetPage === currentPage && !cleanUrl.includes('#')) {
      closeDrawer();
      return;
    }

    // Login or unauthenticated target: full page navigation
    if (targetPage === 'login.html' || AUTH_PAGES.indexOf(targetPage) === -1) {
      window.location.href = targetUrl;
      return;
    }

    var pageContent = document.getElementById('page-content');
    if (!pageContent) {
      window.location.href = targetUrl;
      return;
    }

    isNavigating = true;

    try {
      // 1. Subtle fade out of main content (60ms)
      pageContent.style.transition = 'opacity 80ms ease-out';
      pageContent.style.opacity = '0';

      // 2. Fetch the target HTML document
      var response = await fetch(targetUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var htmlText = await response.text();

      // 3. Parse HTML
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlText, 'text/html');
      var newPageContent = doc.getElementById('page-content');
      if (!newPageContent) throw new Error('Missing #page-content');

      // 4. Update Document Title
      if (doc.title) {
        document.title = doc.title;
      }

      // 5. Update Breadcrumb
      var newBreadcrumb = doc.getElementById('breadcrumb-page-name');
      var curBreadcrumb = document.getElementById('breadcrumb-page-name');
      if (newBreadcrumb && curBreadcrumb) {
        curBreadcrumb.textContent = newBreadcrumb.textContent;
      }

      // 5b. Update Topbar Actions (e.g. mobile tabs in cashier)
      var newActions = doc.getElementById('topbar-actions');
      var curActions = document.getElementById('topbar-actions');
      if (curActions) {
        curActions.innerHTML = newActions ? newActions.innerHTML : '';
      }

      // 6. Update Browser History State
      if (pushState) {
        window.history.pushState({ page: targetPage, url: targetUrl }, doc.title || '', targetUrl);
      }

      // 7. Update Active Navigation styling on persistent sidebar
      updateActiveSidebar(targetPage);

      // 8. Close Mobile Drawer
      closeDrawer();

      // 9. Swap Content
      pageContent.innerHTML = newPageContent.innerHTML;

      // 10. Scroll to top
      window.scrollTo(0, 0);

      // 11. Execute the page script
      var newScript = doc.getElementById('page-script');
      var existingScript = document.getElementById('page-script');
      if (existingScript) existingScript.remove();

      if (newScript && newScript.textContent.trim()) {
        var scriptEl = document.createElement('script');
        scriptEl.id = 'page-script';
        // Execute inside an isolated IIFE so variables never leak or collide across navigations
        scriptEl.textContent = '(function(){\n' + newScript.textContent + '\n})();';
        document.body.appendChild(scriptEl);
      }

      // Dispatch navigation event
      try {
        window.dispatchEvent(new CustomEvent('bh:navigated', { detail: { page: targetPage } }));
      } catch (e) {}

      // Re-bind drawer events for new buttons if any
      bindDrawerEvents();

      // 12. Subtle fade in of main content (120ms)
      requestAnimationFrame(function () {
        pageContent.style.transition = 'opacity 120ms ease-out';
        pageContent.style.opacity = '1';
        isNavigating = false;
      });

    } catch (err) {
      console.warn('Partial navigation fallback:', err);
      window.location.href = targetUrl;
    } finally {
      isNavigating = false;
    }
  }

  var hasInitialInited = false;
  function initialInit() {
    if (hasInitialInited) return;
    hasInitialInited = true;
    var page = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    updateActiveSidebar(page);
    bindDrawerEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialInit);
  } else {
    initialInit();
  }

    // Close drawer when clicking nav links on mobile
    var aside = document.querySelector('aside');
    if (aside) {
      aside.querySelectorAll('nav a, div a').forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth < 1024) closeDrawer();
        });
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    window.addEventListener('resize', function () {
      var els = getDrawerElements();
      if (window.innerWidth >= 1024) {
        if (els.aside) els.aside.classList.remove('-translate-x-full', 'shadow-2xl');
        if (els.backdrop) {
          els.backdrop.classList.add('hidden', 'opacity-0');
          els.backdrop.classList.remove('opacity-100');
        }
        document.body.classList.remove('overflow-hidden', 'lg:overflow-auto');
      } else {
        if (els.aside && !els.aside.classList.contains('translate-x-0')) {
          els.aside.classList.add('-translate-x-full');
        }
      }
    });
  });

  // Global click interceptor for seamless client-side routing
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;

    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }

    var clean = href.split('?')[0].split('#')[0];
    var pageName = (clean.split('/').pop() || '').toLowerCase();
    if (AUTH_PAGES.indexOf(pageName) !== -1) {
      e.preventDefault();
      navigateTo(href, true);
    }
  });

  // Browser Back / Forward handling
  window.addEventListener('popstate', function () {
    var targetPage = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    if (AUTH_PAGES.indexOf(targetPage) !== -1) {
      navigateTo(location.pathname + location.search + location.hash, false);
    }
  });

  // Expose global router for programmatic navigation if needed
  window.BHRouter = {
    navigate: navigateTo
  };

  // Back/forward cache restore
  window.addEventListener('pageshow', function () { root.classList.remove('bh-preload'); });
})();
