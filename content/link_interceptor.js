/**
 * Aistos Link Interceptor Content Script
 * Captures link clicks and delays execution to beat DOM-trampoline tracking mutators.
 */

(function () {
  if (window.__aistosLinkInterceptorLoaded) return;
  window.__aistosLinkInterceptorLoaded = true;

  document.addEventListener("mouseup", async (event) => {
    // Ignore right clicks
    if (event.button === 2) return;

    // Yield to the execution loop to let inline scripts (Google rwt, Yandex borschik) finish modifying href
    await new Promise(resolve => setTimeout(resolve, 0));

    const target = event.target;
    const anchor = target?.closest("a");
    if (!anchor || !anchor.href) return;

    // If an anchor was modified with tracking data attributes, sanitize immediately
    if (anchor.hasAttribute("data-cthref") || anchor.hasAttribute("data-counter")) {
      anchor.removeAttribute("data-cthref");
      anchor.removeAttribute("data-counter");
    }
  }, { capture: true, passive: true });

  // Monitor form input activity for safety against tab discards
  window.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!target) return;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
      window.isReceivingFormInput = true;
    }
  }, { capture: true, passive: true });

  window.addEventListener("submit", () => {
    window.isReceivingFormInput = false;
  }, { capture: true, passive: true });
})();