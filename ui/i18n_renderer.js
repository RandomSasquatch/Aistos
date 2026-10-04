/**
 * Aistos Native i18n Renderer
 * Scans the DOM for data-i18n attributes and injects native localized strings.
 */

export function renderI18n() {
  const elements = document.querySelectorAll("[data-i18n]");
  
  for (const el of elements) {
    const key = el.getAttribute("data-i18n");
    if (!key) continue;

    const message = browser.i18n.getMessage(key);
    if (!message) continue;

    // Handle different node types appropriately
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (el.type === "text" || el.type === "password" || el.tagName === "TEXTAREA") {
        el.placeholder = message;
      } else if (el.type === "button" || el.type === "submit") {
        el.value = message;
      }
    } else if (el.hasAttribute("title") && el.textContent.trim() === "") {
      // Icon-only buttons relying on tooltips
      el.title = message;
    } else {
      // Standard text nodes
      el.textContent = message;
    }
  }
}

// Auto-execute when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderI18n, { once: true });
} else {
  renderI18n();
}