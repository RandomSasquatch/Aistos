/**
 * Aistos Tab & Memory Manager
 * Implements native lazy loading, nearest-neighbor focus transfers,
 * and media/form-safe discard pre-flight assertions.
 */

const discardLock = new Set();

export function setupTabManager() {
  // Listen for discard inquiries from popup or background routines
  browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.action === "DISCARD_BACKGROUND_TABS") {
      return await discardEligibleTabs();
    }
  });
}

export async function createLazyTab(url, cookieStoreId, inBackground = true) {
  try {
    return await browser.tabs.create({
      url,
      cookieStoreId,
      active: !inBackground,
      discarded: inBackground // Native Gecko optimization: spawns 0MB RAM idle tab
    });
  } catch {
    // Fallback if browser version does not support discarded create option
    return await browser.tabs.create({ url, cookieStoreId, active: !inBackground });
  }
}

export async function safeCloseTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab) return;

    if (tab.active) {
      await handoffFocusToNeighbor(tab);
    }
    await browser.tabs.remove(tabId);
  } catch (err) {
    console.warn(`[Aistos] Failed to close tab safely: ${tabId}`, err);
  }
}

export async function handoffFocusToNeighbor(tab) {
  try {
    const windowTabs = await browser.tabs.query({ windowId: tab.windowId });
    if (windowTabs.length <= 1) return;

    // Sort tabs by proximity to closing tab index
    const sortedNeighbors = windowTabs
      .filter(t => t.id !== tab.id && !t.discarded)
      .sort((a, b) => Math.abs(a.index - tab.index) - Math.abs(b.index - tab.index));

    if (sortedNeighbors.length > 0) {
      await browser.tabs.update(sortedNeighbors[0].id, { active: true });
    }
  } catch (e) {
    console.warn("[Aistos] Nearest neighbor handoff yielded no target:", e);
  }
}

async function discardEligibleTabs() {
  const tabs = await browser.tabs.query({ active: false });
  let discardedCount = 0;

  for (const tab of tabs) {
    if (discardLock.has(tab.id) || tab.discarded || tab.pinned || tab.audible) continue;

    // Pre-flight assertion: verify media playback or unsaved forms
    const isProtected = await checkTabProtection(tab.id);
    if (isProtected) continue;

    discardLock.add(tab.id);
    setTimeout(() => discardLock.delete(tab.id), 3000);

    try {
      await browser.tabs.discard(tab.id);
      discardedCount++;
    } catch {
      // Tab may have navigated or closed
    }
  }

  return { success: true, discardedCount };
}

async function checkTabProtection(tabId) {
  try {
    const [result] = await browser.tabs.executeScript(tabId, {
      code: `(function() {
        const hasPip = Boolean(document.pictureInPictureElement);
        const hasActiveMedia = [...document.querySelectorAll('video, audio')].some(m => !m.paused && m.currentTime > 0);
        const isTyping = Boolean(window.isReceivingFormInput);
        return hasPip || hasActiveMedia || isTyping;
      })()`
    });
    return Boolean(result);
  } catch {
    // If execution fails (e.g. on privileged pages), do not discard
    return true;
  }
}