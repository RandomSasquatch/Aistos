/**
 * Aistos Native Context Menu Controller
 * Zero-framework context menu management for clipboard sanitization and container controls.
 * Fully compliant with Manifest V3 'scripting' API constraints.
 */

import { sanitizeUrl } from "./url_sanitizer.js";
import { createBurnerContainer } from "./container_manager.js";

// Menu ID Constants
const MENU_CLEAN_COPY_LINK = "aistos_clean_copy_link";
const MENU_OPEN_BURNER_LINK = "aistos_open_burner_link";
const MENU_OPEN_BURNER_PAGE = "aistos_open_burner_page";
const MENU_CLEAN_PAGE = "aistos_clean_page";

export function setupContextMenu() {
  // Force menu creation unconditionally on boot, bypassing Firefox about:debugging onInstalled bugs
  buildMenus();
  
  // Rebuild if the extension is explicitly installed/updated to ensure persistence
  browser.runtime.onInstalled.addListener(buildMenus);

  // Bind the unified click listener
  browser.contextMenus.onClicked.addListener(handleMenuClick);
}

/**
 * Constructs the right-click menu items for links and empty page space.
 * Suppresses creation errors if the menus already exist during hot-reloads.
 */
function buildMenus() {
  browser.contextMenus.removeAll().then(() => {
    // Link-specific contexts
    browser.contextMenus.create({ 
      id: MENU_CLEAN_COPY_LINK, 
      title: "Copy Clean Link (Strip Tracking)", 
      contexts: ["link"] 
    });
    browser.contextMenus.create({ 
      id: MENU_OPEN_BURNER_LINK, 
      title: "Open Link in New Burner Workspace", 
      contexts: ["link"] 
    });
    
    // Page-specific contexts
    browser.contextMenus.create({ 
      id: MENU_OPEN_BURNER_PAGE, 
      title: "Open Current Page in Burner", 
      contexts: ["page"] 
    });
    browser.contextMenus.create({ 
      id: MENU_CLEAN_PAGE, 
      title: "Sanitize & Reload Current Page", 
      contexts: ["page"] 
    });
  }).catch((err) => console.warn("[Aistos] Context menu creation suppressed during reload:", err));
}

/**
 * Routes menu clicks to their respective privacy functions.
 */
async function handleMenuClick(info, tab) {
  
  // Action 1: Copy stripped URL directly to the user's clipboard
  if (info.menuItemId === MENU_CLEAN_COPY_LINK && info.linkUrl) {
    const clean = sanitizeUrl(info.linkUrl);
    try {
      // Manifest V3 Compliant execution (replaces deprecated tabs.executeScript)
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (urlStr) => { navigator.clipboard.writeText(urlStr); },
        args: [clean]
      });
    } catch (err) { 
      // Fails safely on privileged pages (like about:addons or addons.mozilla.org)
      console.error("[Aistos] Clipboard copy blocked on privileged page:", err); 
    }
  }

  // Action 2: Launch a hyperlink inside a background ephemeral container
  if (info.menuItemId === MENU_OPEN_BURNER_LINK && info.linkUrl) {
    const clean = sanitizeUrl(info.linkUrl);
    const container = await createBurnerContainer();
    await browser.tabs.create({ 
      url: clean, 
      cookieStoreId: container.cookieStoreId, 
      active: false, 
      index: tab.index + 1 
    });
  }

  // Action 3 (New Feature): Clone the active page into a new Burner workspace
  if (info.menuItemId === MENU_OPEN_BURNER_PAGE && info.pageUrl) {
    const clean = sanitizeUrl(info.pageUrl);
    const container = await createBurnerContainer();
    await browser.tabs.create({ 
      url: clean, 
      cookieStoreId: container.cookieStoreId, 
      active: true, // Bring the new burner to the foreground immediately
      index: tab.index + 1 
    });
  }

  // Action 4: Strip trackers from the active URL and navigate cleanly in the same tab
  if (info.menuItemId === MENU_CLEAN_PAGE && tab.url) {
    const clean = sanitizeUrl(tab.url);
    if (clean !== tab.url) {
      await browser.tabs.update(tab.id, { url: clean });
    }
  }
}