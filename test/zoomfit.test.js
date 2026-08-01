// Replays the zoom loop from background.js against simulated pages.
//
// The worker code is welded to chrome.tabs, so this harness re-states the
// loop's order of operations against a model instead of importing it. That
// makes it a contract: if you change the loop in background.js, change the
// replay to match, or the assertions below will tell on you. The constants
// mirror background.js and must be kept in lockstep.
//
// A page is modelled as: its physical window width, the widths in its @media
// rules, and two functions of the CSS viewport — how wide the content column
// is, and how many layout columns are showing. Browser zoom divides the CSS
// viewport; that is the entire simulation.
//
// Run: node test/zoomfit.test.js

const PAD_REM = 1
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const FILL_RATIO = 0.9
const PROBES = 5
const RESPECT_BREAKPOINTS = true
const REM = 16

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

function fit (page) {
  const measure = (zoom) => {
    const viewport = page.physical / zoom
    return { viewport, width: page.widthAt(viewport), cols: page.colsAt(viewport) }
  }

  const base = measure(1)
  const goal = base.viewport - 2 * PAD_REM * REM

  if (base.width >= goal - 4 || base.width >= base.viewport * FILL_RATIO) {
    return { zoom: 1, full: true, reflowed: false }
  }

  const under = (page.bps || []).filter((b) => b < base.viewport)
  const bp = under.length ? Math.max(...under) : 0
  const ceiling = RESPECT_BREAKPOINTS && bp ? base.viewport / (bp + 1) : MAX_ZOOM
  const ideal = goal / base.width
  const wanted = clamp(Math.min(ideal, ceiling), MIN_ZOOM, MAX_ZOOM)

  let lo = MIN_ZOOM
  let hi = wanted
  let best = MIN_ZOOM
  let probe = wanted
  let reflowed = false
  let probes = 0

  for (let i = 0; i < PROBES; i++) {
    probes++
    const m = measure(probe)
    if (m.cols >= base.cols) {
      best = probe
      lo = probe
    } else {
      reflowed = true
      hi = probe
    }
    if (hi - lo < 0.05) break
    probe = (lo + hi) / 2
  }

  return { zoom: best, full: false, reflowed, probes, ideal, ceiling, baseCols: base.cols }
}

// ---- assertions ----

let failures = 0

function run (name, page, checks) {
  console.log(name)
  const r = fit(page)
  const shapeHeld =
    r.full || page.colsAt(page.physical / r.zoom) >= page.colsAt(page.physical)
  assert(shapeHeld, 'layout shape held at the final zoom')
  checks(r)
  console.log('')
}

function assert (cond, label) {
  if (cond) {
    console.log('  ok  ' + label)
  } else {
    failures++
    console.error('  FAIL ' + label)
  }
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

// ---- the cases worth keeping ----

run('single-column page, nothing to break', {
  physical: 1900,
  bps: [],
  widthAt: (vp) => Math.min(700, vp),
  colsAt: () => 1
}, (r) => {
  assert(near(r.zoom, (1900 - 32) / 700), 'reaches the ideal zoom exactly')
  assert(r.probes === 1, 'costs exactly one probe when nothing breaks')
  assert(!r.reflowed, 'no back-off reported')
})

run('real @media breakpoint holds the ceiling', {
  physical: 1890,
  bps: [1012],
  widthAt: (vp) => (vp > 1012.5 ? 960 : 620),
  colsAt: (vp) => (vp > 1012.5 ? 2 : 1)
}, (r) => {
  assert(near(r.zoom, 1890 / 1013), 'settles on the breakpoint ceiling')
  assert(r.zoom < r.ideal, 'held below the ideal by the ceiling')
  assert(!r.reflowed, 'ceiling made the probe safe on the first try')
})

run('JS-driven breakpoint, invisible to @media', {
  // x.com's shape: no readable @media, a sidebar that dies below 1300 CSS px
  physical: 1900,
  bps: [],
  widthAt: (vp) => Math.min(600, vp * 0.4),
  colsAt: (vp) => (vp >= 1300 ? 3 : 2)
}, (r) => {
  assert(r.reflowed, 'the probe detected the lost column')
  assert(r.zoom > 1.2, 'still won real zoom after backing off')
  assert(1900 / r.zoom >= 1300, 'final viewport stays above the JS breakpoint')
})

run('fully fluid page is already full', {
  // 90% of the viewport at every zoom: chasing an absolute target here would
  // multiply forever — the fill-ratio stop is what terminates it
  physical: 1890,
  bps: [],
  widthAt: (vp) => vp * 0.9,
  colsAt: () => 1
}, (r) => {
  assert(r.full, 'declared full without zooming')
  assert(r.zoom === 1, 'zoom untouched')
})

run('hostile page that breaks at any zoom', {
  physical: 1900,
  bps: [],
  widthAt: (vp) => Math.min(700, vp),
  colsAt: (vp) => (vp >= 1900 ? 2 : 1)
}, (r) => {
  assert(r.zoom === MIN_ZOOM, 'falls all the way back to 100%')
  assert(r.reflowed, 'and knows why')
})

run('no @media rules at all: nothing invented, MAX_ZOOM reachable', {
  // the dashboard from the field: an unreadable CDN sheet used to conjure a
  // 1440px breakpoint that capped this page at 140% instead of ~250%
  physical: 1900,
  bps: [],
  widthAt: (vp) => Math.min(560, vp),
  colsAt: () => 1
}, (r) => {
  assert(r.zoom === MAX_ZOOM, 'reaches MAX_ZOOM with no invented ceiling')
})

process.exit(failures ? 1 : 0)
