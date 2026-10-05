/**
 * Aistos Stealth Armor Engine
 * Localized Burner tab anti-fingerprinting. 
 * Kills WebRTC IP leaks natively inside the DOM without mutating global browser prefs.
 */

import { isBurner } from "./container_manager.js";

const PRIVATE_SUBNET_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?)$/i;

export function setupStealthArmor() {
  // Uses onUpdated to intercept new page loads and inject spoofing before DOM executes
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tab.cookieStoreId && isBurner(tab.cookieStoreId)) {
      try {
        const isLocal = isLocalOrPrivateSubnet(new URL(tab.url).hostname);
        if (isLocal) return; // Allow internal WebRTC (routers, local dev)

        // Inject the WebRTC Nullifier specifically into the Burner's execution context
        await browser.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          func: () => {
            // Shadow DOM overriding of WebRTC APIs to prevent IP leakage
            const noOpRTC = function() {
              throw new Error("Aistos Stealth Armor: WebRTC disabled in Ephemeral Workspace.");
            };
            Object.defineProperty(window, 'RTCPeerConnection', { value: noOpRTC, writable: false });
            Object.defineProperty(window, 'webkitRTCPeerConnection', { value: noOpRTC, writable: false });
          },
          injectImmediately: true
        });
      } catch (err) {
        // Suppressed: execution naturally fails on restricted about:* pages
      }
    }
  });
}

function isLocalOrPrivateSubnet(hostname) {
  if (!hostname) return false;
  return PRIVATE_SUBNET_REGEX.test(hostname.trim());
}