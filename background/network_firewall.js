/**
 * Aistos Network Firewall Engine
 * Handles CNAME uncloaking, dynamic DNR rule allocation, and Referrer boundary enforcement.
 */

import { isBurner } from "./container_manager.js";

const DYNAMIC_RULE_START_ID = 60000;
const knownTrackerHosts = new Set();

export function setupNetworkFirewall() {
  // CNAME Uncloaking using native Firefox DNS Resolution
  browser.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (details.type === "main_frame") return; // Keep navigation intact
      if (!details.url || !details.url.startsWith("http")) return;

      try {
        const parsed = new URL(details.url);
        const hostname = parsed.hostname;

        // Skip plain IP addresses and root domains
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.split(".").length <= 2) {
          return;
        }

        // Perform asynchronous DNS resolution
        const dnsRecord = await browser.dns.resolve(hostname, ["canonical_name"]);
        if (dnsRecord && dnsRecord.canonicalName && dnsRecord.canonicalName !== hostname) {
          const canonical = dnsRecord.canonicalName.toLowerCase();

          // Check if resolved canonical name unmasks a tracker
          if (isKnownTracker(canonical)) {
            console.log(`[Aistos CNAME Uncloak] Blocked disguised tracker: ${hostname} -> ${canonical}`);
            return { cancel: true };
          }
        }
      } catch {
        // Continue if DNS resolution fails or times out
      }
      return {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

  // Scoped Burner Session Rules: Cross-site Referrer Clamping
  browser.tabs.onCreated.addListener(async (tab) => {
    if (tab.id && isBurner(tab.cookieStoreId)) {
      await applyTabFirewallRules(tab.id);
    }
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabFirewallRules(tabId);
  });
}

async function applyTabFirewallRules(tabId) {
  const ruleId = DYNAMIC_RULE_START_ID + (tabId % 30000);
  const rule = {
    id: ruleId,
    priority: 100,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "Referer", operation: "set", value: "" }
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
    console.warn(`[Aistos] Failed to apply session firewall rule for tab ${tabId}:`, err);
  }
}

async function clearTabFirewallRules(tabId) {
  const ruleId = DYNAMIC_RULE_START_ID + (tabId % 30000);
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId]
    });
  } catch {
    // Ignore cleanup errors on closed tabs
  }
}

function isKnownTracker(canonicalDomain) {
  const knownTrackingSuffixes = [
    "criteo.net", "omtrdc.net", "demdex.net", "adnxs.com", "branch.io",
    "appsflyer.com", "adjust.com", "segment.io", "pardot.com"
  ];
  return knownTrackingSuffixes.some(suffix => canonicalDomain.endsWith(suffix));
}