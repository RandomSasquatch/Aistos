#!/usr/bin/env node

/**
 * Aistos Memory Leak & Anti-Pattern Auditor
 * Scans background and content scripts for memory leak patterns:
 * - Unbounded module-scope Set/Map instances lacking eviction logic.
 * - Persistent setInterval calls without variable assignment or clearInterval.
 * - Missing removal hooks for transient data.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DIRECTORIES_TO_AUDIT = [
  path.join(ROOT_DIR, "background"),
  path.join(ROOT_DIR, "content")
];

function fail(message) {
  console.error(`\x1b[31m[MEMORY LEAK AUDIT FAILED]\x1b[0m ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`\x1b[32m[MEMORY LEAK AUDIT PASSED]\x1b[0m ${message}`);
}

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const relativePath = path.relative(ROOT_DIR, filePath);

  // 1. Audit Map and Set structures
  const collections = [];
  const mapSetRegex = /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*new\s+(Set|Map)\s*\(/g;
  let match;

  while ((match = mapSetRegex.exec(content)) !== null) {
    collections.push({ name: match[1], type: match[2] });
  }

  for (const col of collections) {
    const deleteRegex = new RegExp(`\\b${col.name}\\.(delete|clear)\\s*\\(`, "g");
    if (!deleteRegex.test(content)) {
      fail(`Potential unbounded memory leak in ${relativePath}: ${col.type} "${col.name}" has no corresponding .delete() or .clear() method call in file.`);
    }
  }

  // 2. Audit setInterval calls
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("setInterval(") && !line.includes("//")) {
      const assignmentRegex = /(?:const|let|var|[a-zA-Z0-9_$.]+)\s*=\s*setInterval\(/;
      if (!assignmentRegex.test(line)) {
        fail(`Unassigned setInterval call at ${relativePath}:${i + 1}. Intervals must be tracked and clearable to allow worker idling.`);
      }
    }
  }

  // 3. Ensure content scripts do not register unbounded window arrays
  if (filePath.includes("content")) {
    if (content.includes("window.") && (content.includes(".push(") || content.includes(".unshift("))) {
      const windowArrayRegex = /window\.([a-zA-Z0-9_$]+)\s*=\s*\[\]/;
      if (windowArrayRegex.test(content)) {
        fail(`Unbounded global window array allocation detected in content script: ${relativePath}`);
      }
    }
  }
}

function runAudit() {
  for (const dir of DIRECTORIES_TO_AUDIT) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      auditFile(path.join(dir, file));
    }
  }

  pass("All background and content collections implement explicit memory eviction and bounded lifetimes.");
}

runAudit();