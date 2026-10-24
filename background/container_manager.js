/**
 * Aistos Container Manager
 * Handles contextual identities, Vault routing, MAC cooperation, and sequential vaporization queues.
 */

const BURNER_PREFIX = "AistosBurner_";
const VAPORIZE_GRACE_PERIOD_MS = 2500;
const CONTAINER_COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];

// Tracks active Burner IDs in-memory to bypass Firefox's opaque internal string IDs
const activeBurnerIds = new Set();
const cleanContainerStates = new Map();

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
        const tabs = await browser.tabs.query({ cookieStoreId });
        if (tabs.length === 0) {
          await new Promise(r => setTimeout(r, VAPORIZE_GRACE_PERIOD_MS));
          const recheckTabs = await browser.tabs.query({ cookieStoreId });
          
          if (recheckTabs.length === 0) {
            await browser.contextualIdentities.remove(cookieStoreId);
            cleanContainerStates.delete(cookieStoreId);
            activeBurnerIds.delete(cookieStoreId); // Free from memory Set
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

export function setupContainerManager() {
  // Hydrate activeBurnerIds on startup by querying existing contextualIdentities
  browser.contextualIdentities.query({}).then((identities) => {
    for (const identity of identities) {
      if (identity.name && identity.name.startsWith(BURNER_PREFIX)) {
        activeBurnerIds.add(identity.cookieStoreId);
        cleanContainerStates.set(identity.cookieStoreId, true);
      }
    }
  }).catch(() => {});

  // Tab close vaporization triggers
  browser.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
    if (removeInfo.isWindowClosing) return;
    try {
      const isRestoreActive = await isSessionRestoreActive();
      if (isRestoreActive) return; 

      for (const burnerId of activeBurnerIds) {
        const remainingTabs = await browser.tabs.query({ cookieStoreId: burnerId });
        if (remainingTabs.length === 0) {
          vaporizationQueue.enqueue(burnerId);
        }
      }
    } catch (err) {
      console.error("[Aistos] Tab removal purge check failed:", err);
    }
  });

  // Domain Vault Routing
  browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (!details.url || details.url.startsWith("about:") || details.url.startsWith("moz-extension:")) return;

    try {
      const tab = await browser.tabs.get(details.tabId);
      if (!tab) return;

      const isMacAssigned = await checkMacAssignment(details.url);
      if (isMacAssigned) return;

      const targetDomain = new URL(details.url).hostname;
      const vaultContainerId = await getVaultContainerForDomain(targetDomain);

      if (vaultContainerId && tab.cookieStoreId !== vaultContainerId) {
        await browser.tabs.create({ url: details.url, cookieStoreId: vaultContainerId, active: tab.active, index: tab.index + 1 });
        await browser.tabs.remove(tab.id);
        return;
      }

      if (tab.cookieStoreId && cleanContainerStates.has(tab.cookieStoreId)) {
        cleanContainerStates.set(tab.cookieStoreId, false);
      }
    } catch (err) {
      console.warn("[Aistos] Navigation router encountered an error:", err);
    }
  });

  // Keyboard shortcut command listener
  browser.commands.onCommand.addListener(async (command) => {
    if (command === "new-burner-tab") {
      const container = await createBurnerContainer();
      await browser.tabs.create({
        cookieStoreId: container.cookieStoreId,
        url: "about:newtab"
      });
    }
  });

  // Synchronous onMessage dispatcher: ONLY returns a Promise for handled actions
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.action === "CREATE_BURNER") {
      return (async () => {
        const container = await createBurnerContainer();
        const tab = await browser.tabs.create({
          cookieStoreId: container.cookieStoreId,
          url: msg.url || "about:newtab",
          active: msg.active !== false
        });
        return { success: true, cookieStoreId: container.cookieStoreId, tabId: tab.id };
      })();
    }

    if (msg?.action === "VAPORIZE_CONTAINER" && msg.cookieStoreId) {
      if (isBurner(msg.cookieStoreId)) {
        vaporizationQueue.enqueue(msg.cookieStoreId);
        return Promise.resolve({ success: true });
      }
    }
    
    if (msg?.action === "VAPORIZE_ALL_BURNERS") {
      return (async () => {
        let count = 0;
        const burnerList = Array.from(activeBurnerIds);
        for (const burnerId of burnerList) {
          const tabs = await browser.tabs.query({ cookieStoreId: burnerId });
          for (const tab of tabs) {
            try {
              await browser.tabs.remove(tab.id);
            } catch {}
          }
          vaporizationQueue.enqueue(burnerId);
          count++;
        }
        return { success: true, purgedCount: count, vaporizedCount: count };
      })();
    }

    if (msg?.action === "SAVE_WORKSPACE") {
      return (async () => {
        const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !isBurner(activeTab.cookieStoreId)) {
          return { success: false, error: "Not in a Burner Tab" };
        }
        try {
          const hostname = new URL(activeTab.url).hostname;
          const newName = `Vault_${hostname}_${Date.now()}`;
          
          await browser.contextualIdentities.update(activeTab.cookieStoreId, { 
            name: newName, 
            icon: "briefcase", 
            color: "blue" 
          });
          
          activeBurnerIds.delete(activeTab.cookieStoreId);
          cleanContainerStates.delete(activeTab.cookieStoreId);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })();
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

  activeBurnerIds.add(identity.cookieStoreId);
  cleanContainerStates.set(identity.cookieStoreId, true);
  return identity;
}

export function isBurner(cookieStoreId) {
  return activeBurnerIds.has(cookieStoreId);
}

export async function getBalancedColor() {
  const identities = await browser.contextualIdentities.query({});
  const usedColors = identities.map(i => i.color);
  const available = CONTAINER_COLORS.filter(c => !usedColors.includes(c));
  if (available.length > 0) {
    return available[0];
  }
  return CONTAINER_COLORS[Math.floor(Math.random() * CONTAINER_COLORS.length)];
}

export async function isSessionRestoreActive() {
  return false;
}

export async function checkMacAssignment(_url) {
  return false;
}

export async function getVaultContainerForDomain(domain) {
  try {
    const { domainVaults = {} } = await browser.storage.local.get("domainVaults");
    if (Array.isArray(domainVaults)) {
      const match = domainVaults.find(r => r.domain === domain || domain.endsWith("." + r.domain));
      return match ? match.containerId : null;
    }
    for (const [vDomain, containerId] of Object.entries(domainVaults)) {
      if (domain === vDomain || domain.endsWith("." + vDomain)) {
        return containerId;
      }
    }
  } catch {
    return null;
  }
  return null;
}