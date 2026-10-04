#!/usr/bin/env node

/**
 * Aistos Memory Bloat & Banned Framework Auditor
 * Scans all extension files to verify absolute absence of external runtimes
 * (React, Vue, jQuery, Lodash, Redux, etc.) and enforces strict byte budgets.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Disallowed dependencies, frameworks, and utility runtimes
const BANNED_PATTERNS = [
  /from\s+['"]react['"]/i,
  /from\s+['"]vue['"]/i,
  /from\s+['"]@angular/i,
  /from\s+['"]svelte['"]/i,
  /from\s+['"]redux['"]/i,
  /from\s+['"]lodash['"]/i,
  /from\s+['"]jquery['"]/i,
  /require\(['"]react['"]\)/i,
  /require\(['"]vue['"]\)/i,
  /require\(['"]jquery['"]\)/i,
  /require\(['"]lodash['"]\)/i,
  /require\(['"]redux['"]\)/i,
  /<script[^>]*src=["'][^"']*(react|vue|angular|jquery|lodash|redux|bootstrap)[^"']*["']/i
];

// File budget limits
const MAX_TOTAL_CODE_SIZE_BYTES = 1024 * 1024; // 1 MB code cap (excluding packaged local CDN shims)
const MAX_SINGLE_SCRIPT_SIZE_BYTES = 250 * 1024; // 250 KB max single file limit

const EXCLUDE_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "dist",
  "scripts",
  "lib" // Dedicated local shims excluded from bloat scan
]);

function fail(message) {
  console.error(`\x1b[31m[BLOAT AUDIT FAILED]\x1b[0m ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`\x1b[32m[BLOAT AUDIT PASSED]\x1b[0m ${message}`);
}

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".js", ".mjs", ".html", ".css", ".json"].includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function runAudit() {
  const files = scanDirectory(ROOT_DIR);
  let totalBytes = 0;

  for (const file of files) {
    const stat = fs.statSync(file);
    const relativePath = path.relative(ROOT_DIR, file);
    totalBytes += stat.size;

    if (stat.size > MAX_SINGLE_SCRIPT_SIZE_BYTES) {
      fail(`File exceeds maximum individual budget of ${MAX_SINGLE_SCRIPT_SIZE_BYTES / 1024} KB: ${relativePath} (${(stat.size / 1024).toFixed(2)} KB)`);
    }

    const content = fs.readFileSync(file, "utf8");
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(content)) {
        fail(`Prohibited runtime framework or heavy utility pattern detected in ${relativePath}: ${pattern}`);
      }
    }
  }

  if (totalBytes > MAX_TOTAL_CODE_SIZE_BYTES) {
    fail(`Total code size exceeds maximum threshold of ${MAX_TOTAL_CODE_SIZE_BYTES / 1024} KB. Total: ${(totalBytes / 1024).toFixed(2)} KB`);
  }

  pass(`Zero banned frameworks detected. Total codebase footprint: ${(totalBytes / 1024).toFixed(2)} KB (Target: < ${(MAX_TOTAL_CODE_SIZE_BYTES / 1024).toFixed(0)} KB).`);
}

runAudit();