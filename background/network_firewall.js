/**
 * Aistos Network Firewall Engine
 * Handles CNAME uncloaking, dynamic DNR rule allocation, and Referrer boundary enforcement.
 * Compliant with Phase 2 Sub-10MB Memory Bounds.
 */

import { isBurner } from "./container_manager.js";

const DYNAMIC_RULE_START_ID = 60000;

// Aistos Memory Bounded Caches
// Stores DNS resolution results to prevent CPU spikes from redundant lookups
const knownTrackerHosts = new Set();
const safeHostsCache = new Set();

// Pre-compiled list of tracker suffixes allocated once at boot to save RAM
const TRACKER_SUFFIXES = [
  "criteo.net", "omtrdc.net", "demdex.net", "adnxs.com", "branch.io",
  "appsflyer.com", "adjust.com", "segment.io", "pardot.com"
];

export function setupNetworkFirewall() {
  // CNAME Uncloaking using native Firefox DNS Resolution
  browser.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (details.type === "main_frame") return; // Keep top-level user navigation intact
      if (!details.url || !details.url.startsWith("http")) return;

      try {
        const parsed = new URL(details.url);
        const hostname = parsed.hostname;

        // 1. Fast-Path: Check memory caches before running expensive DNS lookups
        if (knownTrackerHosts.has(hostname)) return { cancel: true };
        if (safeHostsCache.has(hostname)) return {};

        // Skip plain IP addresses and short root domains
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.split(".").length <= 2) {
          return {};
        }

        // 2. Perform asynchronous DNS resolution to catch CNAME cloaking
        const dnsRecord = await browser.dns.resolve(hostname, ["canonical_name"]);
        
        if (dnsRecord && dnsRecord.canonicalName && dnsRecord.canonicalName !== hostname) {
          const canonical = dnsRecord.canonicalName.toLowerCase();

          // Check if the unmasked canonical name is a known tracker
          if (isKnownTracker(canonical)) {
            console.info(`[Aistos Firewall] Blocked CNAME cloaked tracker: ${hostname} -> ${canonical}`);
            
            // Cache the malicious host and enforce memory limits (Fixes CI Leak Auditor)
            knownTrackerHosts.add(hostname);
            if (knownTrackerHosts.size > 1000) knownTrackerHosts.clear();
            
            return { cancel: true };
          }
        }

        // Cache safe hosts to speed up future requests and enforce memory limits
        safeHostsCache.add(hostname);
        if (safeHostsCache.size > 2000) safeHostsCache.clear();

      } catch (err) {
        // Fail open: If the native DNS resolver times out, allow the request to prevent page breakage
      }
      return {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

  // Scoped Burner Session Rules: Cross-site Referrer & Origin Clamping
  browser.tabs.onCreated.addListener(async (tab) => {
    if (tab.id && isBurner(tab.cookieStoreId)) {
      await applyTabFirewallRules(tab.id);
    }
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabFirewallRules(tabId);
  });
}

/**
 * Dynamically binds strict cross-site header rules exclusively to Burner Workspaces.
 */
async function applyTabFirewallRules(tabId) {
  const ruleId = DYNAMIC_RULE_START_ID + (tabId % 30000);
  const rule = {
    id: ruleId,
    priority: 100,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "Referer", operation: "set", value: "" },
        { header: "Origin", operation: "set", value: "null" }
      ]
    },
    condition: {
      tabIds: [tabId],
      domainType: "thirdParty",
      resourceTypes: ["sub_frame", "script", "xmlhttprequest"]
    }
  };

  try {
    await browser.declarativeNetRequest.updateSessionRules({
      addRules: [rule],
      removeRuleIds: [ruleId]
    });
  } catch (err) {
    console.warn(`[Aistos Firewall] Failed to bind DNR rules for Burner tab ${tabId}:`, err);
  }
}

/**
 * Purges dynamic rules when a Burner tab is closed.
 */
async function clearTabFirewallRules(tabId) {
  const ruleId = DYNAMIC_RULE_START_ID + (tabId % 30000);
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId]
    });
  } catch {
    // Ignore DNR cleanup errors on rapidly closed tabs
  }
}

/**
 * Verifies if the resolved canonical domain belongs to a tracking network.
 */
function isKnownTracker(canonicalDomain) {
  return TRACKER_SUFFIXES.some(suffix => canonicalDomain.endsWith(suffix));
}