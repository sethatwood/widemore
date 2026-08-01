// Shared by the content script, the service worker (via importScripts), and
// the popup. One source of truth for the settings shape and the presets.

const WM_DEFAULTS = {
  enabled: true,
  disabledSites: [], // origins, e.g. "https://example.com"
  preset: 'signal', // last chosen preset, or 'custom' once a knob deviates
  knobs: {
    base: 22, // vh — seeds the φ ladder, i.e. rail length
    barWidth: 20, // px
    radius: 10, // px, inner corners; half the width reads as a full pill
    presence: 1, // resting opacity of the rail
    finish: 'tint', // 'tint' = accent colour | 'clear' = frosted, colourless
    accent: '#2bbf9f',
    edges: 'both', // 'both' | 'left' | 'right'
    align: 'middle', // 'high' | 'middle' | 'low' — vertical placement
    dwellMs: 320, // hover-to-fire delay
    shy: false, // rails stay invisible until the pointer nears an edge
    toast: true
  }
}

// A preset is a named bundle of the theme knobs. Placement (edges, align) and
// the toast are personal rather than thematic, so presets leave them alone.
const WM_PRESETS = {
  signal: { finish: 'tint', accent: '#2bbf9f', barWidth: 20, radius: 10, presence: 1, base: 22, dwellMs: 320 },
  glass: { finish: 'clear', accent: '#ffffff', barWidth: 14, radius: 7, presence: 0.9, base: 22, dwellMs: 320 },
  ghost: { finish: 'tint', accent: '#79a8a0', barWidth: 10, radius: 5, presence: 0.35, base: 18, dwellMs: 400 },
  ember: { finish: 'tint', accent: '#f59e43', barWidth: 20, radius: 10, presence: 1, base: 22, dwellMs: 320 },
  frame: { finish: 'tint', accent: '#2bbf9f', barWidth: 6, radius: 0, presence: 0.5, base: 38, dwellMs: 320 },
  beacon: { finish: 'tint', accent: '#2bbf9f', barWidth: 28, radius: 14, presence: 1, base: 26, dwellMs: 240 }
}

// Stored settings may predate a knob's existence; defaults fill the gaps.
const wmMerge = (stored) => ({
  ...WM_DEFAULTS,
  ...(stored || {}),
  knobs: { ...WM_DEFAULTS.knobs, ...((stored || {}).knobs || {}) }
})

const wmPresetOf = (knobs) => {
  const hit = Object.entries(WM_PRESETS).find(([, p]) =>
    Object.keys(p).every((k) => knobs[k] === p[k])
  )
  return hit ? hit[0] : 'custom'
}

// The gradient's bright core is derived, not chosen: mixing the accent toward
// white keeps any picked colour and its core in a pair that cannot clash.
const wmCore = (hex, amt = 0.35) => {
  const ch = (i) =>
    Math.round(
      parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * (1 - amt) + 255 * amt
    )
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`
}
