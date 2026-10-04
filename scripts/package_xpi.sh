#!/usr/bin/env bash

# Aistos Production Packaging Script
# Compiles clean production XPI, strips developer artifacts,
# and verifies compliance using Mozilla's official addons-linter.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
TMP_DIR="${ROOT_DIR}/.build_tmp"

# Extract Version from manifest.json
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${ROOT_DIR}/manifest.json')).version)")
XPI_NAME="aistos-${VERSION}.xpi"
OUTPUT_XPI="${DIST_DIR}/${XPI_NAME}"

echo -e "\x1b[34m[AISTOS PACKAGER]\x1b[0m Packaging Aistos v${VERSION}..."

# Clean previous builds
rm -rf "${DIST_DIR}" "${TMP_DIR}"
mkdir -p "${DIST_DIR}" "${TMP_DIR}"

# Stage release files excluding build tools, CI, and development artifacts
echo -e "\x1b[34m[AISTOS PACKAGER]\x1b[0m Staging production files..."
rsync -av \
  --exclude='.git*' \
  --exclude='.github' \
  --exclude='scripts' \
  --exclude='dist' \
  --exclude='node_modules' \
  --exclude='package*.json' \
  --exclude='*.md' \
  --exclude='*.DS_Store' \
  "${ROOT_DIR}/" "${TMP_DIR}/"

# Build Zip / XPI Archive
cd "${TMP_DIR}"
zip -r -9 "${OUTPUT_XPI}" ./* > /dev/null
cd "${ROOT_DIR}"
rm -rf "${TMP_DIR}"

# Verify Archive Creation
if [ ! -f "${OUTPUT_XPI}" ]; then
  echo -e "\x1b[31m[PACKAGING FAILED]\x1b[0m Target archive was not generated."
  exit 1
fi

FILESIZE=$(stat -c%s "${OUTPUT_XPI}")
echo -e "\x1b[32m[PACKAGING SUCCESS]\x1b[0m Built: ${OUTPUT_XPI} ($(( FILESIZE / 1024 )) KB)"

# Run Mozilla Add-on Linter
if command -v addons-linter &> /dev/null; then
  echo -e "\x1b[34m[AISTOS PACKAGER]\x1b[0m Running Mozilla addons-linter..."
  addons-linter "${OUTPUT_XPI}" --warnings-as-errors
  echo -e "\x1b[32m[LINTER PASSED]\x1b[0m Zero validation errors or warnings from addons-linter."
else
  echo -e "\x1b[33m[WARNING]\x1b[0m addons-linter not installed globally. Skipping native lint verification."
fi