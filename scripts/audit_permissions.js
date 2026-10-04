#!/usr/bin/env node

/**
 * Aistos Static Permission Auditor
 * Validates manifest.json against a strict Zero-Trust allowlist.
 * Ensures Gecko MV3 compliance and prevents unapproved privilege escalation.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");

const PERMISSION_ALLOWLIST = new Set([
  "contextualIdentities",
  "cookies",
  "declarativeNetRequest",
  "dns",
  "privacy",
  "storage",
  "tabs",
  "history",
  "contextMenus",
  "webNavigation",
  "webRequest",
  "webRequestBlocking",
  "alarms"
  "scripting"
]);

const HOST_PERMISSION_ALLOWLIST = new Set([
  "<all_urls>"
]);

function fail(message) {
  console.error(`\x1b[31m[SECURITY AUDIT FAILED]\x1b[0m ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`\x1b[32m[SECURITY AUDIT PASSED]\x1b[0m ${message}`);
}

function runAudit() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail(`manifest.json not found at ${MANIFEST_PATH}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    fail(`Failed to parse manifest.json: ${err.message}`);
  }

  // 1. Verify Manifest Version
  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3. Found: ${manifest.manifest_version}`);
  }

  // 2. Verify Gecko ID and Strict Min Version
  const geckoSettings = manifest.browser_specific_settings?.gecko;
  if (!geckoSettings) {
    fail("Missing browser_specific_settings.gecko object.");
  }

  if (!geckoSettings.id || !geckoSettings.id.includes("@")) {
    fail(`Invalid or missing Gecko extension ID: "${geckoSettings.id}"`);
  }

  const minVersion = parseFloat(geckoSettings.strict_min_version || "0");
  if (minVersion < 115) {
    fail(`strict_min_version must be >= 115.0 for modern Gecko MV3 APIs. Found: "${geckoSettings.strict_min_version}"`);
  }

  // 3. Audit Declared API Permissions
  const permissions = manifest.permissions || [];
  for (const perm of permissions) {
    if (!PERMISSION_ALLOWLIST.has(perm)) {
      fail(`Unauthorized permission requested: "${perm}". Does not conform to Aistos Zero-Trust allowlist.`);
    }
  }

  // 4. Audit Host Permissions (must not reside in general permissions array)
  for (const perm of permissions) {
    if (perm.includes("://") || perm === "<all_urls>") {
      fail(`Host permission "${perm}" found in "permissions" array. In MV3, hosts must be in "host_permissions".`);
    }
  }

  const hostPermissions = manifest.host_permissions || [];
  for (const host of hostPermissions) {
    if (!HOST_PERMISSION_ALLOWLIST.has(host)) {
      fail(`Unauthorized host permission requested: "${host}".`);
    }
  }

  // 5. Verify No Disallowed Remote Resources
  if (manifest.content_security_policy) {
    const csp = JSON.stringify(manifest.content_security_policy);
    if (csp.includes("https:") || csp.includes("http:") || csp.includes("'unsafe-eval'")) {
      fail("Insecure CSP detected. Remote code execution or unsafe-eval is forbidden.");
    }
  }

  pass("All permissions and Gecko MV3 requirements conform strictly to Zero-Trust policies.");
}

runAudit();