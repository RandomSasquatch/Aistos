/**
 * Aistos SPA Route Scrubber
 * Scrubs tracking tokens injected into the URL during SPA client-side routing.
 */

(function () {
  if (window.__aistosSpaScrubberLoaded) return;
  window.__aistosSpaScrubberLoaded = true;

  const TRACKING_KEYS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "mc_eid", "igshid", "twclid", "yclid"
  ];

  function scrubCurrentLocation() {
    try {
      const url = new URL(window.location.href);
      let modified = false;

      for (const key of TRACKING_KEYS) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          modified = true;
        }
      }

      if (modified) {
        window.history.replaceState(window.history.state, document.title, url.toString());
      }
    } catch {
      // Ignore location extraction anomalies
    }
  }

  // Hook into client-side history navigation
  window.addEventListener("popstate", scrubCurrentLocation, { passive: true });
  window.addEventListener("hashchange", scrubCurrentLocation, { passive: true });

  // Initial pass on document idle
  scrubCurrentLocation();
})();