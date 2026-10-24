import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
const version = manifest.version || "1.0.0";
const xpiName = `aistos-${version}.xpi`;
const outputXpiPath = path.join(DIST_DIR, xpiName);

console.log(`\x1b[34m[AISTOS BUILD]\x1b[0m Packaging Aistos v${version}...`);

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Create write stream for XPI
const output = fs.createWriteStream(outputXpiPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on("close", () => {
  const bytes = archive.pointer();
  console.log(`\x1b[32m[BUILD SUCCESS]\x1b[0m Generated: ${outputXpiPath} (${Math.round(bytes / 1024)} KB)`);
});

archive.on("error", (err) => {
  console.error("\x1b[31m[BUILD ERROR]\x1b[0m", err);
  process.exit(1);
});

archive.pipe(output);

// Include extension assets
const itemsToInclude = [
  "manifest.json",
  "LICENSE",
  "README.md",
  "_locales",
  "background",
  "content",
  "icons",
  "rules",
  "ui"
];

for (const item of itemsToInclude) {
  const fullPath = path.join(ROOT_DIR, item);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      archive.directory(fullPath, item);
    } else {
      archive.file(fullPath, { name: item });
    }
  }
}

archive.finalize();
