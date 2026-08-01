# widemore

Hover the screen edge and the page's main content spreads to fill the window.
You bought all that glass, and most pages hand a third of it back in empty
gutters; widemore takes the dead space back. Built for ultrawide monitors,
happy on any screen with room to spare.

Named for what you actually think when you hit a narrow column in a wide
window: *i wish it was wide more.*

**[widemore.page](https://widemore.page)** — the site, with a live demo. The
Chrome Web Store listing is in review; widemore runs in Chrome and Brave.
MIT licensed.

## Load it

1. `chrome://extensions` → enable **Developer mode** (top right)
2. **Load unpacked** → select this folder
3. Reload any tab you want it on — content scripts only attach on page load

After editing a file, hit the reload arrow on the extension card *and* reload
the page. A fresh install opens a one-time welcome page with a practice run of
the gesture — loading unpacked counts as one.

## Tests

`node test/zoomfit.test.js` replays the zoom loop against simulated pages —
a real breakpoint, a JS-driven one invisible to `@media`, a fluid page, a
hostile page that breaks at any zoom. CI runs it on every push, alongside
syntax checks. If you change the loop in `background.js`, change the replay
to match; that file is the contract.

## The edge rails

Two faint pills — 20px wide, ~36vh tall by default — sit at the left and right
edges, vertically centered. Hover one and it grows by another φ step to ~58vh
rather than thickening, which enlarges the target you are already aiming at.
A teal gradient then radiates from the center outward to both ends over ~320ms,
with a glow ramping up behind it; when it reaches the ends, zoom-fit fires.
Move off early and nothing happens — the fill is the dodge window, made visible
so you can see it coming.

The fill's timing is linear on purpose. It doubles as a countdown, and an eased
curve would misreport how much time is left to move away; the glow supplies the
drama without lying about the clock.

The rails hold a constant physical size at any zoom. Browser zoom scales the
whole page and the rails live in the page, so every px dimension in their CSS is
written `calc(Npx / var(--z))`, where `--z` is the live zoom factor pushed from
the service worker via `chrome.tabs.onZoomChange` — which covers your own ⌘+ and
⌘- as well as the extension's. Heights need no correction: they are in `vh`, and
the viewport measured in CSS pixels shrinks by exactly the same factor.

Hovering again resets the zoom. After a fire there's an 800ms lockout so the
page reflowing under your cursor can't bounce it straight back.

The rails are the pointer interface; **⌥⇧F** fires the exact same fit from
the keyboard, for hands that never hover. **⌥⇧W** turns the whole tool off
and on, and the toolbar panel holds everything else.

## Make it yours

Click the toolbar icon for the panel: a master switch, an off-switch for the
current site, and six presets — **signal**, **glass**, **ghost**, **ember**,
**frame**, **beacon** — each drawn in the panel as a miniature rail wearing its
own settings. Behind the presets sit the settings themselves: color (or
**clear**, a colorless frosted finish that blurs the page through the rail
instead of tinting it), size, width, shape, presence (resting opacity), and
patience (the dwell time), plus placement — which edges, and how high on them.

**Shy mode** hides the rails entirely until your cursor comes within ~80px of
an edge (zoom-corrected, so the trigger distance stays physically constant).
The hit area never moves; only visibility changes.

Settings live in `chrome.storage.sync`, so they roam with your Chrome profile,
and every open tab restyles the moment you move a slider — the page behind the
popup is the preview.

## Breakpoints

Browser zoom shrinks the CSS viewport, so enough of it drops a page through its
own responsive breakpoints — GitHub at 300% hands you the phone layout, which is
the opposite of the point. So before zooming, the page is asked for every width
in its own `@media` rules (cross-origin sheets throw on `cssRules` and are
skipped). The zoom is then held just above the nearest breakpoint below the
current width.

**No fallback list of common framework widths.** An earlier version guessed at
1440/1280/1024/… when it could not read any stylesheet, which capped a page that
had no breakpoints at all: an internal dashboard with zero `@media` rules and
one CDN `<link>` missing its `crossorigin` attribute — enough to throw on
`cssRules` regardless of what the CDN sends — got held at 140% by an invented
1440px breakpoint instead of reaching the ~250% that actually filled the window.
Guessing is wrong in both directions, and the probe below is the real check.

On a 1890px window GitHub settles around 145% with a 1302px CSS viewport, safely
clear of its 1012px breakpoint. The cap protects against bad detection too: if
the detector grabs a 296px sidebar and asks for 628%, the ceiling still holds it
at ~148% instead of catapulting you into the mobile layout.

Set `RESPECT_BREAKPOINTS = false` in `background.js` to zoom regardless.

### Reading @media is not enough

X killed its right sidebar despite the cap. Apps built on React Native Web drive
their layout from JavaScript reading `window.innerWidth`, so there is no
`@media` rule to find at any price — and their stylesheets are cross-origin on
top of that, so `cssRules` throws before you even get to look.

So the predicted ceiling is only the opening guess. After zooming, the page is
asked how many major vertical columns it is showing; if that number dropped, a
column died and the zoom bisects back toward 1 until the shape holds. `PROBES`
(5) bounds the search.

Columns are counted by clustering the left edges of every element taller than
half the viewport, ignoring slivers. Clustering rather than bucketing means a
column's nested wrappers collapse into one entry instead of straddling a
boundary, and the count survives a feed re-rendering underneath it — which X's
timeline does constantly.

Two rules keep the search from retreating off a page that was fine:

- **No upper width bound when counting.** Excluding wide elements by their
  fraction of the viewport reads as sensible and is a trap: zoom shrinks the
  viewport while a fixed-width container keeps its CSS width, so the container's
  ratio climbs until it crosses the bound and vanishes from the count. On a
  1200px container in a 1900px window that fires at 160% — an ordinary page,
  wrongly read as having lost a column. Full-bleed wrappers sit at left 0 and
  cluster together anyway, contributing one stable entry.
- **Only a drop counts as damage.** The count can legitimately rise as the
  viewport shrinks, since more elements clear the half-viewport-height bar.

A page that survives its first probe costs exactly one probe, so the common case
is no slower than before. Only pages that actually break pay for the search.

There is a second stop condition worth knowing about, since it is what keeps the
loop honest: a fluid container occupies the same *fraction* of the viewport at
every zoom, so it never reaches an absolute pixel target and the loop would
multiply itself upward on every pass. Anything already covering `FILL_RATIO`
(90%) of the window is therefore declared full and left alone.

## How detection works

`pick()` scores every block element by text length, with a 3× bonus for
`<main>`/`[role=main]` and 2× for `<article>`, and drops anything whose class or
id looks like chrome (nav, sidebar, footer, …). Since text length accumulates up
the tree, the winner is usually a tall stack of interchangeable wrapper divs all
scoring identically — so `tighten()` then descends while a single child still
holds ≥90% of the text, stopping where content first branches into siblings.
That lands on the actual column.

The zoom math is worth knowing when you tweak it: browser zoom shrinks the
reported viewport width but leaves an un-reflowed element's width alone, so
`viewport / column` is the correction factor *relative to the current zoom*.
That makes it iterative and self-correcting — apply, re-measure, apply again.

## Known rough edges

- **The rails want `<all_urls>`.** They have to exist at the screen edge before
  you hover — that is the entire interface — so there is no user gesture to
  hang `activeTab` on. The extension collects nothing and makes no network
  requests; the source in this repo is the whole story.
- **The detector sometimes picks a sidebar.** On a GitHub profile it can crown
  the ~296px sidebar instead of the content column. The breakpoint ceiling and
  the probe make this harmless — you get too little zoom, never a broken
  layout — and the toast names the element it chose, so a suspicious name is
  the tell.
- **The right rail overlaps the scrollbar track.** 28px of hit area at the very
  edge; on a page with a classic (non-overlay) scrollbar, dragging the thumb
  near the rail's height can hit the rail instead. Moving the rails high or low
  in the panel sidesteps it.
- **Zoom scales the chrome too.** A page with a fixed sidebar gets a *bigger*
  sidebar. Sometimes the responsive breakpoint saves you; sometimes it doesn't.
- **Nothing persists.** Zoom is per-tab and clears on navigation, by design —
  hover again and it's gone. Per-site memory is the obvious next feature.

---

Icon derived from [Tabler Icons](https://tabler.io/icons) (MIT). Say hello:
[hello@widemore.page](mailto:hello@widemore.page).
