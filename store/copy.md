# Chrome Web Store listing — widemore

Everything the dashboard asks for, verbatim. The screenshots and tiles in this
directory are generated from `store/src/` by `tools/build-store-assets.sh`;
the upload ZIP comes from `tools/pack.sh`. Nothing here is secret — every word
and pixel below becomes public on the store page the day it's approved.

## Name

widemore

## Summary (132 chars max)

Hover the screen edge; the page grows to fill your ultrawide's dead space. No
accounts, no tracking, free forever.

## Description

You bought all that glass, and most pages hand a third of it back in empty
gutters. widemore takes the dead space back.

HOW IT WORKS

Two faint rails wait at the edges of every page. Rest your cursor on one for a
beat — a fill runs while you decide — and the page's content column zooms
until it spans your window. widemore reads the page's own breakpoints and
probes the layout as it zooms, so multi-column sites keep their shape. Hover
again and everything goes back exactly as it was: the zoom lives in that one
tab and clears itself.

MAKE IT YOURS

Six presets — signal, glass, ghost, ember, frame, beacon — and every setting
behind them: color (or a colorless frosted-glass finish), size, width, shape,
presence, patience, and placement. Turn on shy mode and the rails stay hidden
until your cursor comes looking. Alt+Shift+W turns the whole thing off and
on, Alt+Shift+F fits the page straight from the keyboard — no pointer
needed — and any site can be switched off individually.

THE FINE PRINT, WHICH IS SHORT

No accounts. No analytics. No data leaves your browser. Free forever, MIT
licensed, and the source is short enough to read in one sitting:
https://github.com/sethatwood/widemore

Built for ultrawide monitors — where a fixed-width page wastes most of the
screen — and happy on any display with room to spare: widescreen, 1080p,
1440p, super-ultrawide. If the page is narrower than the window, widemore can
fill it. Great for reading, writing, dashboards, docs, and wikis.

https://widemore.page · privacy: https://widemore.page/privacy.html

## Category

Accessibility.

Earned, not aspirational: the tool is a readability aid (apparent text size
at distance is the whole point), the fit is reachable without a pointer
(Alt+Shift+F fires the same action the rails do), the result is announced to
screen readers through a live-region toast, and reduced-motion preferences
are respected. If the dashboard taxonomy forces a second choice, Productivity
→ Tools is the fallback.

## Language

English

## Store listing fields

| field | value |
| --- | --- |
| Homepage | https://widemore.page |
| Support | hello@widemore.page |
| Privacy policy | https://widemore.page/privacy.html |

## Screenshots (1280×800, in this order)

1. `screenshots/1-hover-the-edge.png` — the gesture: rail mid-arm on a page
2. `screenshots/2-fills-your-glass.png` — the result: column spanning, toast up
3. `screenshots/3-the-countdown.png` — the rail close up: linear fill, glow
4. `screenshots/4-make-it-yours.png` — the real panel: presets and settings
5. `screenshots/5-fine-print.png` — the trust block

Promo tile: `promo-tile.png` (440×280). Marquee: `marquee.png` (1400×560),
only used if featured.

## Privacy tab answers

- Single purpose: widemore does one thing — on the user's gesture it zooms
  the current tab until the page's main content column fills the window, and
  undoes it on the next gesture.
- Data collected: none. The extension has no analytics, no accounts, and
  makes no network requests.
- Remote code: none (MV3; everything ships in the package).

## Permission justifications

**Host permission, `<all_urls>`.** The extension's entire interface is a pair
of hover rails that must exist at the screen edge *before* any user gesture
occurs, on whatever page the user is reading. Because the interface precedes
the gesture, there is no click or command to gate an `activeTab` grant on.
The content script only measures layout and renders the rails; zooming uses
`chrome.tabs.setZoom`, scoped per-tab. No page content is read beyond layout
geometry, nothing is transmitted anywhere, and the full source is public at
https://github.com/sethatwood/widemore.

**storage.** Holds the user's own settings — preset, colors, sizes, the
per-site off list — in `chrome.storage.sync` so they follow their Chrome
profile. Nothing else is stored.

## Submission checklist

1. `tools/pack.sh` — builds `widemore-<version>.zip` from an explicit
   allowlist; inspect the printed file list before uploading.
2. Developer account ($5 one-time), listing fields from this file.
3. Upload screenshots in the order above; icon 128 comes from the ZIP.
4. Expect a slower review — broad host permissions get human attention.
   The justification above is the answer to the questions they ask.
5. On approval: swap the site's "in review" button for the store URL, flip
   the repo public, then launch week per LAUNCH.md §6.
