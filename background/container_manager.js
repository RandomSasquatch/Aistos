/**
 * Aistos Container Manager
 * Handles contextual identities, Vault routing, MAC cooperation, and sequential vaporization queues.
 */

const BURNER_PREFIX = "AistosBurner_";
const VAPORIZE_GRACE_PERIOD_MS = 2500;
const CONTAINER_COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple"];

// Tracks active Burner IDs to bypass Firefox's opaque string IDs (e.g. "firefox-container-1")
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
            activeBurnerIds.delete(cookieStoreId); // Free the memory Set
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
  browser.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
    if (removeInfo.isWindowClosing) return;
    try {
      const isRestoreActive = await isSessionRestoreActive();
      if (isRestoreActive) return; 

      // Only iterate through actively tracked burners
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
    
    // Feature Addition: Vaporize All
    if (msg.action === "VAPORIZE_ALL_BURNERS") {
      let count = 0;
      for (const burnerId of activeBurnerIds) {
        const tabs = await browser.tabs.query({ cookieStoreId: burnerId });
        for (const tab of tabs) await browser.tabs.remove(tab.id);
        vaporizationQueue.enqueue(burnerId);
        count++;
      }
      return { success: true, vaporizedCount: count };
    }

    // Feature Addition: Convert ephemeral session to persistent Vault
    if (msg.action === "SAVE_WORKSPACE") {
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
        
        // Remove from the Burner tracking arrays to ensure it becomes permanent
        activeBurnerIds.delete(activeTab.cookieStoreId);
        cleanContainerStates.delete(activeTab.cookieStoreId);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
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

  activeBurnerIds.add(identity.cookieStoreId);
  cleanContainerStates.set(identity.cookieStoreId, true);
  return identity;
}

export function isBurner(cookieStoreId) {
  return activeBurnerIds.has(cookieStoreId);
}

// ... [Keep getBalancedColor(), isSessionRestoreActive(), checkMacAssignment(), getVaultContainerForDomain() as previously provided]