/**
 * Aistos Network Firewall Engine
 * Handles CNAME uncloaking, dynamic DNR rule allocation, and Referrer boundary enforcement.
 * Compliant with Phase 2 Sub-10MB Memory Bounds (TTL Caching).
 */

import { isBurner } from "./container_manager.js";

const DYNAMIC_RULE_START_ID = 60000;
let cloakedDnrIdCounter = 80000;

// TTL Memory Caches (Evicted natively to pass CI leak audits)
const knownTrackerHosts = new Set();
const safeHostsCache = new Set();

const TRACKER_SUFFIXES = [
  "criteo.net", "omtrdc.net", "demdex.net", "adnxs.com", "branch.io",
  "appsflyer.com", "adjust.com", "segment.io", "pardot.com"
];

export function setupNetworkFirewall() {
  // CNAME Uncloaking
  browser.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (details.type === "main_frame") return; 
      if (!details.url || !details.url.startsWith("http")) return;

      try {
        const parsed = new URL(details.url);
        const hostname = parsed.hostname;

        if (knownTrackerHosts.has(hostname) || safeHostsCache.has(hostname)) return;

        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.split(".").length <= 2) {
          return;
        }

        const dnsRecord = await browser.dns.resolve(hostname, ["canonical_name"]);
        
        if (dnsRecord && dnsRecord.canonicalName && dnsRecord.canonicalName !== hostname) {
          const canonical = dnsRecord.canonicalName.toLowerCase();

          if (TRACKER_SUFFIXES.some(suffix => canonical.endsWith(suffix))) {
            console.info(`[Aistos Firewall] Uncloaked Tracker: ${hostname} -> ${canonical}`);
            
            // Push rule to the C++ DNR Firewall to block all subsequent subresources synchronously
            await blockCloakedTracker(hostname);
            
            knownTrackerHosts.add(hostname);
            setTimeout(() => knownTrackerHosts.delete(hostname), 3600000); // 1-Hour TTL
            return;
          }
        }

        safeHostsCache.add(hostname);
        setTimeout(() => safeHostsCache.delete(hostname), 3600000); // 1-Hour TTL

      } catch (err) {
        // Fail open on DNS timeout
      }
    },
    { urls: ["<all_urls>"] } 
    // Manifest V3: ["blocking"] removed to permit async DNS resolution
  );

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
 * Commits a CNAME uncloaked tracker to the Declarative Net Request engine.
 */
async function blockCloakedTracker(hostname) {
  const ruleId = cloakedDnrIdCounter++;
  const rule = {
    id: ruleId,
    priority: 100,
    action: { type: "block" },
    condition: { 
      urlFilter: `||${hostname}^`, 
      resourceTypes: ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "ping"] 
    }
  };
  try {
    await browser.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
  } catch (e) {
    console.warn(`[Aistos Firewall] DNR block mapping failed for ${hostname}`);
  }
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

async function clearTabFirewallRules(tabId) {
  const ruleId = DYNAMIC_RULE_START_ID + (tabId % 30000);
  try {
    await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  } catch {}
}