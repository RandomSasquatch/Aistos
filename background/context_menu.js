/**
 * Aistos Native Context Menu Controller
 * Zero-framework context menu management for clipboard sanitization and container controls.
 */

import { sanitizeUrl } from "./url_sanitizer.js";
import { createBurnerContainer } from "./container_manager.js";

const MENU_CLEAN_COPY = "aistos_clean_copy";
const MENU_OPEN_BURNER = "aistos_open_burner";

export function setupContextMenu() {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: MENU_CLEAN_COPY,
        title: "Copy Clean Link (Strip Tracking)",
        contexts: ["link"]
      });

      browser.contextMenus.create({
        id: MENU_OPEN_BURNER,
        title: "Open Link in New Burner Workspace",
        contexts: ["link"]
      });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_CLEAN_COPY && info.linkUrl) {
      const clean = sanitizeUrl(info.linkUrl);
      try {
        await browser.tabs.executeScript(tab.id, {
          code: `navigator.clipboard.writeText(${JSON.stringify(clean)});`
        });
      } catch (err) {
        console.error("[Aistos] Failed to copy clean link to clipboard:", err);
      }
    }

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
  });
}