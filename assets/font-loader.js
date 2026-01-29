// Font loader - External file for CSP compliance
(function() {
  'use strict';
  const fontLink = document.querySelector('link[rel="preload"][as="style"][href*="fonts.googleapis.com"]');
  if (fontLink) {
    fontLink.onload = function() {
      this.onload = null;
      this.rel = 'stylesheet';
      if (document.body) {
        document.body.classList.add('loaded');
      }
    };
    // Fallback: if onload doesn't fire, load after a delay
    setTimeout(function() {
      if (fontLink.rel === 'preload') {
        fontLink.rel = 'stylesheet';
        if (document.body) {
          document.body.classList.add('loaded');
        }
      }
    }, 3000);
  }
})();
