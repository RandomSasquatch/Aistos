/**
 * Aistos Native Context Menu Controller
 * Zero-framework context menu management for clipboard sanitization and container controls.
 * Fully compliant with Manifest V3 'scripting' API constraints.
 */

import { sanitizeUrl } from "./url_sanitizer.js";
import { createBurnerContainer } from "./container_manager.js";

const MENU_CLEAN_COPY = "aistos_clean_copy";
const MENU_OPEN_BURNER = "aistos_open_burner";
const MENU_CLEAN_PAGE = "aistos_clean_page";

export function setupContextMenu() {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      // 1. Clean Link Copy
      browser.contextMenus.create({
        id: MENU_CLEAN_COPY,
        title: "Copy Clean Link (Strip Tracking)",
        contexts: ["link"]
      });

      // 2. Open in Isolated Workspace
      browser.contextMenus.create({
        id: MENU_OPEN_BURNER,
        title: "Open Link in New Burner Workspace",
        contexts: ["link"]
      });

      // 3. Clean Active Page URL
      browser.contextMenus.create({
        id: MENU_CLEAN_PAGE,
        title: "Sanitize Current Page URL",
        contexts: ["page"]
      });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    // Action 1: Copy stripped URL directly to the user's clipboard
    if (info.menuItemId === MENU_CLEAN_COPY && info.linkUrl) {
      const clean = sanitizeUrl(info.linkUrl);
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: (urlStr) => { navigator.clipboard.writeText(urlStr); },
          args: [clean]
        });
      } catch (err) {
        console.error("[Aistos] Failed to copy clean link to clipboard:", err);
      }
    }

    // Action 2: Launch link inside an ephemeral container
    if (info.menuItemId === MENU_OPEN_BURNER && info.linkUrl) {
      const clean = sanitizeUrl(info.linkUrl);
      const container = await createBurnerContainer();
      await browser.tabs.create({
        url: clean,
        cookieStoreId: container.cookieStoreId,
        active: false,
        index: tab.index + 1
      });
    }

    // Action 3: Strip trackers from the active URL and navigate cleanly
    if (info.menuItemId === MENU_CLEAN_PAGE && tab.url) {
      const clean = sanitizeUrl(tab.url);
      if (clean !== tab.url) {
        await browser.tabs.update(tab.id, { url: clean });
      }
    }
  });
}