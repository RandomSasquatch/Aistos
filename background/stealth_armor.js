/**
 * Aistos Stealth Armor Engine
 * Context-aware dynamic anti-fingerprinting. Applies Tor-uplift mitigations
 * and WebRTC deactivation strictly when inside Burner workspaces.
 */

import { isBurner } from "./container_manager.js";

const PRIVATE_SUBNET_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?)$/i;

export function setupStealthArmor() {
  // Focus listener: switches privacy postures instantly when the user switches tabs
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      await evaluateTabPrivacyPosture(tab);
    } catch (err) {
      console.warn("[Aistos] Failed to evaluate focus stealth posture:", err);
    }
  });

  browser.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) return;
    try {
      const [activeTab] = await browser.tabs.query({ active: true, windowId });
      if (activeTab) {
        await evaluateTabPrivacyPosture(activeTab);
      }
    } catch (err) {
      console.warn("[Aistos] Focus change stealth posture update failed:", err);
    }
  });
}

export function isLocalOrPrivateSubnet(hostname) {
  if (!hostname) return false;
  return PRIVATE_SUBNET_REGEX.test(hostname.trim());
}

async function evaluateTabPrivacyPosture(tab) {
  if (!tab || !tab.cookieStoreId) return;

  // Verify if destination is private subnet / localhost
  let isLocal = false;
  if (tab.url && !tab.url.startsWith("about:")) {
    try {
      isLocal = isLocalOrPrivateSubnet(new URL(tab.url).hostname);
    } catch {
      isLocal = false;
    }
  }

  const inBurner = isBurner(tab.cookieStoreId) && !isLocal;

  if (inBurner) {
    // Maximum Protection for Burner Container: Zero WebRTC leak, Native Tor-Farbling
    try {
      await browser.privacy.network.peerConnectionEnabled.set({ value: false });
      if (browser.privacy.websites.resistFingerprinting) {
        await browser.privacy.websites.resistFingerprinting.set({ value: true });
      }
    } catch (e) {
      console.warn("[Aistos] Failed to engage strict stealth armor:", e);
    }
  } else {
    // Normal / Vault Container: Clear overrides to restore Meet/Zoom/WebGL performance
    try {
      await browser.privacy.network.peerConnectionEnabled.clear({});
      if (browser.privacy.websites.resistFingerprinting) {
        await browser.privacy.websites.resistFingerprinting.clear({});
      }
    } catch (e) {
      console.warn("[Aistos] Failed to revert stealth armor:", e);
    }
  }
}