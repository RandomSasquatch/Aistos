/**
 * Aistos SPA (Single Page Application) Scrubber
 * Dynamically cleans URLs in modern web apps without triggering page reloads.
 */

let TRACKING_KEYS = new Set();

async function initScrubber() {
  try {
    // Single Source of Truth: Fetch master list once per page load to save memory
    const res = await fetch(browser.runtime.getURL("rules/tracking_params.json"));
    if (res.ok) {
      const list = await res.json();
      TRACKING_KEYS = new Set(list);
    }
  } catch (err) {
    console.warn("[Aistos] Failed to load tracking dictionary in SPA scrubber.", err);
  }
}

function scrubCurrentUrl() {
  if (TRACKING_KEYS.size === 0) return;

  try {
    const parsed = new URL(location.href);
    let dirty = false;
    const keysToDelete = [];

    // Native iterator prevents temporary array memory allocation
    for (const key of parsed.searchParams.keys()) {
      if (TRACKING_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      keysToDelete.forEach(k => parsed.searchParams.delete(k));
      dirty = true;
    }

    if (dirty) {
      // Clean the URL bar without triggering a navigation event or reloading the page
      history.replaceState(history.state, "", parsed.toString());
    }
  } catch {
    // Ignore parse errors on malformed URLs
  }
}

// 1. Listen for standard SPA navigation events (Vue, early React, Angular)
window.addEventListener("popstate", scrubCurrentUrl);
window.addEventListener("hashchange", scrubCurrentUrl);

// 2. Advanced SPA Edge Case: Catch silent pushState mutations (Next.js, React Router v6)
// By observing the <title> tag, we catch page transitions that bypass popstate
const titleObserver = new MutationObserver(() => scrubCurrentUrl());
const titleElement = document.querySelector("title");
if (titleElement) {
  titleObserver.observe(titleElement, { childList: true, subtree: true });
}

// Initialize and run once on initial load
initScrubber().then(scrubCurrentUrl);