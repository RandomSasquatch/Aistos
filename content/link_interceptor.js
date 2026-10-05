/**
 * Aistos DOM-Trampoline Beater (Link Interceptor)
 * Yields to the event loop to catch Google/Facebook redirect wrappers,
 * then sanitizes the href right before the browser physically navigates.
 */

// ESLint Fix: Track user input cleanly in the DOM to avoid global window pollution
document.addEventListener("input", (e) => {
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
    document.documentElement.dataset.aistosFormInput = "true";
  }
}, { passive: true, capture: true });

function sanitizeLink(anchor) {
  if (!anchor || !anchor.href) return;
  
  try {
    const parsed = new URL(anchor.href);
    let dirty = false;
    const keysToDelete = [];
    
    // Front-line defense: strip obvious tracking before handing off to background recursive sanitizer
    for (const key of parsed.searchParams.keys()) {
      if (key.toLowerCase().startsWith("utm_")) {
        keysToDelete.push(key);
      }
    }
    
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(k => parsed.searchParams.delete(k));
      dirty = true;
    }
    
    if (dirty) {
      anchor.href = parsed.toString();
    }
  } catch {
    // Ignore malformed hrefs
  }
}

function handleInteraction(event) {
  const anchor = event.target.closest("a");
  if (!anchor) return;

  // Yield to event loop: allow sites (like Google Search) to execute their mousedown
  // tracker scripts to rewrite the URL, THEN strip the trackers right before navigation.
  setTimeout(() => sanitizeLink(anchor), 0);
}

// Catch mouse clicks
document.addEventListener("mouseup", handleInteraction, { capture: true, passive: true });

// Catch keyboard navigation (Enter or Space on focused links)
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    handleInteraction(event);
  }
}, { capture: true, passive: true });