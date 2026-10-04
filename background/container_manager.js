/**
 * Aistos Container Manager
 * Handles contextual identities, Vault routing, MAC cooperation, and sequential vaporization queues.
 */

const BURNER_PREFIX = "AistosBurner_";
const VAPORIZE_GRACE_PERIOD_MS = 2500;
const CONTAINER_COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];

// In-memory bounded queue to prevent SQLite lock contention during simultaneous deletions
class VaporizationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.enqueuedSet = new Set();
  }

  enqueue(cookieStoreId) {
    if (this.enqueuedSet.has(cookieStoreId)) return;
    this.enqueuedSet.add(cookieStoreId);
    this.queue.push(cookieStoreId);
    this.process();
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const cookieStoreId = this.queue.shift();
      this.enqueuedSet.delete(cookieStoreId);

      try {
        // Verification: ensure no active tabs exist in this container
        const tabs = await browser.tabs.query({ cookieStoreId });
        if (tabs.length === 0) {
          await new Promise(r => setTimeout(r, VAPORIZE_GRACE_PERIOD_MS));
          // Final check after cooldown
          const recheckTabs = await browser.tabs.query({ cookieStoreId });
          if (recheckTabs.length === 0) {
            await browser.contextualIdentities.remove(cookieStoreId);
            cleanContainerStates.delete(cookieStoreId);
          }
        }
      } catch (err) {
        console.warn(`[Aistos] Failed to vaporize container ${cookieStoreId}:`, err);
      }
    }

    this.isProcessing = false;
  }
}

const vaporizationQueue = new VaporizationQueue();
const cleanContainerStates = new Map(); // Tracks "clean" state to prevent redirect loops

export function setupContainerManager() {
  // Listen for closed tabs to trigger vaporization
  browser.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
    if (removeInfo.isWindowClosing) return;

    try {
      const isRestoreActive = await isSessionRestoreActive();
      if (isRestoreActive) return; // Prevent wiping cookies during crash recovery

      const identities = await browser.contextualIdentities.query({});
      const burners = identities.filter(id => id.name.startsWith(BURNER_PREFIX));

      for (const burner of burners) {
        const remainingTabs = await browser.tabs.query({ cookieStoreId: burner.cookieStoreId });
        if (remainingTabs.length === 0) {
          vaporizationQueue.enqueue(burner.cookieStoreId);
        }
      }
    } catch (err) {
      console.error("[Aistos] Tab removal purge check failed:", err);
    }
  });

  // Intercept navigation for Domain Vaults & Loop Protection
  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // Top-level navigations only
    if (!details.url || details.url.startsWith("about:") || details.url.startsWith("moz-extension:")) return;

    try {
      const tab = await browser.tabs.get(details.tabId);
      if (!tab) return;

      // 1. MAC Handshake: Yield to Multi-Account Containers if rule exists
      const isMacAssigned = await checkMacAssignment(details.url);
      if (isMacAssigned) return;

      // 2. Domain Vault Routing
      const targetDomain = new URL(details.url).hostname;
      const vaultContainerId = await getVaultContainerForDomain(targetDomain);

      if (vaultContainerId && tab.cookieStoreId !== vaultContainerId) {
        // Reroute into the dedicated vault
        await browser.tabs.create({
          url: details.url,
          cookieStoreId: vaultContainerId,
          active: tab.active,
          index: tab.index + 1
        });
        await browser.tabs.remove(tab.id);
        return;
      }

      // 3. Mark Burner containers unclean after initial request
      if (tab.cookieStoreId && cleanContainerStates.has(tab.cookieStoreId)) {
        cleanContainerStates.set(tab.cookieStoreId, false);
      }
    } catch (err) {
      console.warn("[Aistos] Navigation router encountered an error:", err);
    }
  });

  // Remote action listener
  browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === "CREATE_BURNER") {
      const container = await createBurnerContainer();
      const tab = await browser.tabs.create({
        cookieStoreId: container.cookieStoreId,
        url: msg.url || "about:newtab",
        active: msg.active !== false
      });
      return { success: true, cookieStoreId: container.cookieStoreId, tabId: tab.id };
    }

    if (msg.action === "VAPORIZE_CONTAINER" && msg.cookieStoreId) {
      if (isBurner(msg.cookieStoreId)) {
        vaporizationQueue.enqueue(msg.cookieStoreId);
        return { success: true };
      }
    }
  });
}

export async function createBurnerContainer() {
  const color = await getBalancedColor();
  const name = `${BURNER_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const identity = await browser.contextualIdentities.create({
    name,
    color,
    icon: "circle"
  });

  cleanContainerStates.set(identity.cookieStoreId, true);
  return identity;
}

export function isBurner(cookieStoreId) {
  return typeof cookieStoreId === "string" && cookieStoreId.includes(BURNER_PREFIX);
}

async function getBalancedColor() {
  try {
    const identities = await browser.contextualIdentities.query({});
    const counts = {};
    CONTAINER_COLORS.forEach(c => (counts[c] = 0));
    identities.forEach(id => {
      if (counts[id.color] !== undefined) counts[id.color]++;
    });

    let leastColor = CONTAINER_COLORS[0];
    let minCount = Infinity;
    for (const color of CONTAINER_COLORS) {
      if (counts[color] < minCount) {
        minCount = counts[color];
        leastColor = color;
      }
    }
    return leastColor;
  } catch {
    return "red";
  }
}

async function isSessionRestoreActive() {
  const tabs = await browser.tabs.query({ url: "about:sessionrestore" });
  return tabs.length > 0;
}

async function checkMacAssignment(url) {
  try {
    const res = await browser.runtime.sendMessage("@testpilot-containers", {
      method: "getAssignment",
      url
    });
    return !!(res && res.userContextId);
  } catch {
    return false; // MAC not installed or unassigned
  }
}

async function getVaultContainerForDomain(hostname) {
  const { domainVaults } = await browser.storage.local.get("domainVaults");
  if (!domainVaults || typeof domainVaults !== "object") return null;

  for (const [domain, cookieStoreId] of Object.entries(domainVaults)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return cookieStoreId;
    }
  }
  return null;
}