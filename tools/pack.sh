#!/bin/bash
# Builds the Chrome Web Store upload ZIP from an explicit allowlist — the
# extension and nothing else. The site, docs, tests, CI, and store assets
# never ship. Inspect the printed listing before uploading.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)")"
OUT="widemore-$VERSION.zip"
rm -f "$OUT"

zip -q "$OUT" \
  manifest.json \
  defaults.js \
  content.js \
  background.js \
  popup.html popup.css popup.js \
  welcome.html welcome.css welcome.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png

echo "built $OUT:"
unzip -l "$OUT"
