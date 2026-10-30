/* BarberHub POS — Motion helpers (no libraries, no delays) */
(function () {
  var root = document.documentElement;
  // Block transitions during first paint so late-injected styles (Tailwind CDN)
  // don't animate the sidebar/topbar into place on every page load.
  root.classList.add('bh-preload');
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove('bh-preload'); });
    });
  });
  document.addEventListener('DOMContentLoaded', function () {
    // Mark active sidebar item (static orange indicator, no entrance animation)
    var page = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
    document.querySelectorAll('aside nav a[href]').forEach(function (a) {
      if ((a.getAttribute('href') || '').toLowerCase() === page) a.setAttribute('aria-current', 'page');
    });
  });
  // Back/forward cache restore: ensure nothing is stuck in preload state
  window.addEventListener('pageshow', function () { root.classList.remove('bh-preload'); });
})();
