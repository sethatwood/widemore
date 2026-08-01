importScripts('defaults.js') // WM_DEFAULTS and the merge helpers

const PAD_REM = 1 // breathing room left and right, in root em
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const REFLOW_MS = 250
const FILL_RATIO = 0.9 // at or above this fraction of the window, call it filled
const PROBES = 5 // bisection attempts when the layout changes shape
const RESPECT_BREAKPOINTS = true // false = zoom as far as it goes, layout be damned

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

const send = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => null)

async function zoomFit (tabId) {
  // Per-tab scope so this never leaks into a permanent per-origin zoom for
  // sites visited later, and so it clears on navigation.
  await chrome.tabs.setZoomSettings(tabId, { scope: 'per-tab', mode: 'automatic' })

  const current = await chrome.tabs.getZoom(tabId)
  if (Math.abs(current - 1) > 0.02) {
    await chrome.tabs.setZoom(tabId, 1)
    await send(tabId, { type: 'toast', msg: 'widemore: zoom reset' })
    return
  }

  const base = await send(tabId, { type: 'measure' })
  if (!base || !base.width) return

  const goal = base.viewport - 2 * PAD_REM * base.rem

  // Already spanning the window, so there is nothing to fit. The ratio test is
  // the one that matters: a fluid container holds the same fraction of the
  // viewport at every zoom and never reaches an absolute target, so without it
  // the loop would just multiply itself upward on every pass.
  if (base.width >= goal - 4 || base.width >= base.viewport * FILL_RATIO) {
    await send(tabId, {
      type: 'toast',
      msg: `widemore: ${base.label} already spans the window`
    })
    return
  }

  // Zoom shrinks the CSS viewport, so enough of it drops a page through its own
  // responsive breakpoints. First guess: stay above the nearest @media width
  // below the current one.
  const under = (base.breakpoints || []).filter((b) => b < base.viewport)
  const bp = under.length ? Math.max(...under) : 0
  const ceiling = RESPECT_BREAKPOINTS && bp ? base.viewport / (bp + 1) : MAX_ZOOM
  const ideal = goal / base.width
  const wanted = clamp(Math.min(ideal, ceiling), MIN_ZOOM, MAX_ZOOM)

  // Predicting is not enough on its own. Apps built on React Native Web (X, for
  // one) drive their layout from JavaScript reading window.innerWidth, so there
  // is no @media rule to find, and cross-origin stylesheets cannot be read at
  // all. So probe the target and count the page's columns: if one disappeared,
  // bisect back toward 1 until the layout holds its shape.
  let lo = MIN_ZOOM
  let hi = wanted
  let best = MIN_ZOOM
  let probe = wanted
  let reflowed = false

  for (let i = 0; i < PROBES; i++) {
    await chrome.tabs.setZoom(tabId, probe)
    await sleep(REFLOW_MS)
    const m = await send(tabId, { type: 'measure' })
    // Only a DROP means a column died. The count can legitimately rise as the
    // viewport shrinks -- elements cross the half-viewport-height bar and start
    // qualifying -- and treating that as damage backs off pages that are fine.
    if (!m || m.cols >= base.cols) {
      best = probe
      lo = probe
    } else {
      reflowed = true
      hi = probe
    }
    // A page that survives its first probe costs exactly one probe, same as
    // before. Only pages that break pay for the search.
    if (hi - lo < 0.05) break
    probe = (lo + hi) / 2
  }

  if (Math.abs(best - probe) > 0.005) {
    await chrome.tabs.setZoom(tabId, best)
    await sleep(REFLOW_MS)
  }

  let note = ''
  if (reflowed) note = `  (backed off to keep ${base.cols} columns)`
  else if (bp && ceiling < ideal) note = `  (held above ${bp}px breakpoint)`

  await send(tabId, {
    type: 'toast',
    msg: `widemore: ${base.label} → ${Math.round(best * 100)}%${note}`
  })
}

async function run (tabId) {
  if (!tabId) return
  try {
    await zoomFit(tabId)
  } catch (e) {
    console.warn('[widemore]', e)
  }
}

// Keeps the rails at a constant physical size by telling the page what to
// divide its px dimensions by. Fires for our own zoom and for the user's
// ⌘+ / ⌘- alike, so the rails never inflate.
chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  send(tabId, { type: 'scale', z: newZoomFactor })
})

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!sender.tab) return false
  // Fired by the hover rails in the page.
  if (msg.type === 'zoom-fit') {
    run(sender.tab.id)
    return false
  }
  if (msg.type === 'hello') {
    chrome.tabs
      .getZoom(sender.tab.id)
      .then((z) => respond({ z }))
      .catch(() => respond({ z: 1 }))
    return true // respond() is async
  }
  return false
})

// First run, or upgrade from the era when the only setting was a boolean in
// storage.local: seed the sync settings once and retire the old key. A fresh
// install also gets the welcome page — one shot, never on updates.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.sync.get('settings')
  if (!settings) {
    const { rails } = await chrome.storage.local.get({ rails: true })
    await chrome.storage.sync.set({ settings: { ...wmMerge(null), enabled: rails } })
    await chrome.storage.local.remove('rails')
  }
  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') })
  }
})

// ⌥⇧W turns the whole tool on or off. ⌥⇧F fires the same single fit the
// rails fire -- the keyboard path to the one verb, for hands that never
// hover. Both respect the enabled flag and the per-site off list.
chrome.commands.onCommand.addListener(async (command) => {
  const { settings } = await chrome.storage.sync.get('settings')
  const s = wmMerge(settings)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (command === 'toggle-rails') {
    s.enabled = !s.enabled
    await chrome.storage.sync.set({ settings: s })
    if (tab) {
      await send(tab.id, {
        type: 'toast',
        force: true,
        msg: `widemore ${s.enabled ? 'on' : 'off'}`
      })
    }
    return
  }

  if (command === 'zoom-fit' && tab) {
    let origin = null
    try {
      origin = new URL(tab.url).origin
    } catch (e) {
      /* no usable URL */
    }
    if (!s.enabled || (origin && s.disabledSites.includes(origin))) {
      await send(tab.id, {
        type: 'toast',
        force: true,
        msg: 'widemore is off here — ⌥⇧W turns it on'
      })
      return
    }
    await run(tab.id)
  }
})
