#!/bin/bash
# Regenerates every store asset from store/src/. The only non-deterministic
# input is the popup itself, captured live from popup.html with a stubbed
# chrome API so the screenshot can never drift from the shipped panel.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) the real panel, rendered at 2x for crispness inside frame 4
cp popup.css defaults.js popup.js store/src/popup-stub.js "$TMP/"
sed 's#<script src="defaults.js"></script>#<script src="popup-stub.js"></script><script src="defaults.js"></script>#' \
  popup.html > "$TMP/panel.html"
"$CHROME" --headless=new --disable-gpu --force-device-scale-factor=2 \
  --screenshot="$TMP/panel.png" --window-size=292,586 \
  "file://$TMP/panel.html" >/dev/null 2>&1
base64 < "$TMP/panel.png" | tr -d '\n' > "$TMP/panel.b64"

# 2) frames, tile, marquee
mkdir -p store/screenshots
cp store/src/shared.css "$TMP/"

shot () { # source-html output-png WxH
  perl -pe 'BEGIN{open F,"<","'"$TMP"'/panel.b64" or die; local $/; $b64=<F>; close F}
            s/__POPUP_B64__/$b64/' "store/src/$1" > "$TMP/scene.html"
  "$CHROME" --headless=new --disable-gpu --screenshot="$2" \
    --window-size="$3" "file://$TMP/scene.html" >/dev/null 2>&1
  echo "$2  $(sips -g pixelWidth -g pixelHeight "$2" 2>/dev/null | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}')"
}

shot frame-1-hover.html      store/screenshots/1-hover-the-edge.png   1280,800
shot frame-2-filled.html     store/screenshots/2-fills-your-glass.png 1280,800
shot frame-3-countdown.html  store/screenshots/3-the-countdown.png    1280,800
shot frame-4-panel.html      store/screenshots/4-make-it-yours.png    1280,800
shot frame-5-fineprint.html  store/screenshots/5-fine-print.png       1280,800
shot promo-tile.html         store/promo-tile.png                     440,280
shot marquee.html            store/marquee.png                        1400,560
