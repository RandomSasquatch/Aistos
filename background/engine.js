/**
 * Aistos Master Engine Coordinator
 * Initializes all core privacy services, sets up the zero-allocation watchdog,
 * and maintains crash recovery immunity.
 */

import { setupContainerManager } from "./container_manager.js";
import { setupStealthArmor } from "./stealth_armor.js";
import { setupNetworkFirewall } from "./network_firewall.js";
import { setupUrlSanitizer, initUrlSanitizer } from "./url_sanitizer.js";
import { setupTabManager } from "./tab_manager.js";
import { setupContextMenu } from "./context_menu.js";

const WATCHDOG_ALARM_NAME = "Aistos_Watchdog_Heartbeat";

async function boot() {
  console.log("[Aistos Engine] Initializing Zero-Trust Security Sandbox...");

  // 1. Load static dictionaries
  await initUrlSanitizer();

  // 2. Bind functional managers
  setupContainerManager();
  setupStealthArmor();
  setupNetworkFirewall();
  setupTabManager();
  setupContextMenu();

  // 3. Register Watchdog Heartbeat Alarm
  browser.alarms.create(WATCHDOG_ALARM_NAME, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(onWatchdogAlarm);

  console.log("[Aistos Engine] Phase 1 Core Modules Loaded Successfully.");
}

async function onWatchdogAlarm(alarm) {
  if (alarm.name !== WATCHDOG_ALARM_NAME) return;

  try {
    // Assert active state: ensure no orphaned burners with 0 tabs linger in memory
    const identities = await browser.contextualIdentities.query({});
    const burners = identities.filter(id => id.name.startsWith("AistosBurner_"));

    for (const burner of burners) {
      const tabs = await browser.tabs.query({ cookieStoreId: burner.cookieStoreId });
      if (tabs.length === 0) {
        await browser.contextualIdentities.remove(burner.cookieStoreId);
        console.log(`[Aistos Watchdog] Purged orphaned burner: ${burner.cookieStoreId}`);
      }
    }
  } catch (err) {
    console.warn("[Aistos Watchdog] Heartbeat execution failed:", err);
  }
}

// Lifecycle boot
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await browser.storage.local.set({
      domainVaults: {},
      installedAt: Date.now()
    });
  }
});

boot();