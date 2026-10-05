/**
 * Aistos Native Context Menu Controller
 * Zero-framework context menu management for clipboard sanitization, 
 * container controls, and global session management.
 */
import { sanitizeUrl } from "./url_sanitizer.js";
import { createBurnerContainer } from "./container_manager.js";

// Menu ID Constants
const MENU_CLEAN_COPY_LINK = "aistos_clean_copy_link";
const MENU_OPEN_BURNER_LINK = "aistos_open_burner_link";
const MENU_OPEN_BURNER_PAGE = "aistos_open_burner_page";
const MENU_CLEAN_PAGE = "aistos_clean_page";
const MENU_NEW_BLANK_BURNER = "aistos_new_blank_burner";
const MENU_PANIC_DISCARD = "aistos_panic_discard";
const MENU_OPEN_DASHBOARD = "aistos_open_dashboard";

export function setupContextMenu() {
  buildMenus();
  browser.runtime.onInstalled.addListener(buildMenus);
  browser.contextMenus.onClicked.addListener(handleMenuClick);
}

function buildMenus() {
  browser.contextMenus.removeAll().then(() => {
    // --- Link Contexts ---
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

    // --- Page / Background Contexts (Includes Custom New Tab Pages & Touch Long-Press) ---
    browser.contextMenus.create({
      id: "aistos_page_separator_1",
      type: "separator",
      contexts: ["page"]
    });
    browser.contextMenus.create({
      id: MENU_NEW_BLANK_BURNER,
      title: "New Blank Burner Tab",
      contexts: ["page"]
    });
    browser.contextMenus.create({
      id: MENU_OPEN_BURNER_PAGE,
      title: "Clone Current Page to Burner",
      contexts: ["page"]
    });
    browser.contextMenus.create({
      id: MENU_CLEAN_PAGE,
      title: "Sanitize & Reload Current Page",
      contexts: ["page"]
    });
    
    browser.contextMenus.create({
      id: "aistos_page_separator_2",
      type: "separator",
      contexts: ["page"]
    });
    browser.contextMenus.create({
      id: MENU_PANIC_DISCARD,
      title: "Panic Button: Discard Background Tabs",
      contexts: ["page"]
    });
    browser.contextMenus.create({
      id: MENU_OPEN_DASHBOARD,
      title: "Open Aistos Command Center",
      contexts: ["page"]
    });
  }).catch((err) => console.warn("[Aistos] Context menu creation suppressed during reload:", err));
}

async function handleMenuClick(info, tab) {
  // 1. Link Handlers
  if (info.menuItemId === MENU_CLEAN_COPY_LINK && info.linkUrl) {
    const clean = sanitizeUrl(info.linkUrl);
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (urlStr) => { navigator.clipboard.writeText(urlStr); },
        args: [clean]
      });
    } catch (err) {
      console.error("[Aistos] Clipboard copy blocked on privileged page:", err);
    }
  }

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

  // 2. Page / Background Handlers
  if (info.menuItemId === MENU_NEW_BLANK_BURNER) {
    const container = await createBurnerContainer();
    await browser.tabs.create({
      url: "about:newtab",
      cookieStoreId: container.cookieStoreId,
      active: true
    });
  }

  if (info.menuItemId === MENU_OPEN_BURNER_PAGE && info.pageUrl) {
    const clean = sanitizeUrl(info.pageUrl);
    const container = await createBurnerContainer();
    await browser.tabs.create({
      url: clean,
      cookieStoreId: container.cookieStoreId,
      active: true,
      index: tab.index + 1
    });
  }

  if (info.menuItemId === MENU_CLEAN_PAGE && tab.url) {
    const clean = sanitizeUrl(tab.url);
    if (clean !== tab.url) {
      await browser.tabs.update(tab.id, { url: clean });
    }
  }

  // 3. Global Session Handlers
  if (info.menuItemId === MENU_PANIC_DISCARD) {
    await browser.runtime.sendMessage({ action: "DISCARD_BACKGROUND_TABS" });
  }

  if (info.menuItemId === MENU_OPEN_DASHBOARD) {
    await browser.tabs.create({ url: browser.runtime.getURL("ui/dashboard/dashboard.html") });
  }
}