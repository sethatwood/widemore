/* global WM_DEFAULTS, WM_PRESETS, wmMerge, wmPresetOf */

const $ = (id) => document.getElementById(id)

let settings = wmMerge(null)
let origin = null // origin of the active tab, or null where widemore can't run
let saveTimer = null

// Debounced so slider drags stay inside storage.sync's write quota. Open tabs
// repaint from storage.onChanged, so every save is also the live preview.
const save = (immediate) => {
  clearTimeout(saveTimer)
  if (immediate) chrome.storage.sync.set({ settings })
  else saveTimer = setTimeout(() => chrome.storage.sync.set({ settings }), 120)
}

const SLIDERS = [
  ['base', (v) => v + 'vh'],
  ['barWidth', (v) => v + 'px'],
  ['radius', (v) => v + 'px'],
  ['presence', (v) => Math.round(v * 100) + '%'],
  ['dwellMs', (v) => v + 'ms']
]

const setSwitch = (el, on) => el.setAttribute('aria-checked', String(on))

const render = () => {
  setSwitch($('master'), settings.enabled)
  document.body.classList.toggle('off', !settings.enabled)

  if (origin) {
    $('siteLabel').textContent = 'on ' + new URL(origin).hostname
    $('site').disabled = false
    setSwitch($('site'), !settings.disabledSites.includes(origin))
  } else {
    $('siteLabel').textContent = 'not available on this page'
    $('site').disabled = true
    setSwitch($('site'), false)
  }

  const k = settings.knobs
  for (const [key, fmt] of SLIDERS) {
    $(key).value = k[key]
    $(key + 'Val').textContent = fmt(k[key])
  }
  $('accent').value = k.accent
  $('accent').classList.toggle('dimmed', k.finish === 'clear')
  // the way home to the default teal exists only while you're away from it
  $('accentReset').hidden =
    k.accent.toLowerCase() === WM_DEFAULTS.knobs.accent && k.finish === 'tint'
  $('clear').setAttribute('aria-pressed', String(k.finish === 'clear'))

  for (const group of ['edges', 'align']) {
    for (const btn of document.querySelectorAll(`#${group} button`)) {
      btn.classList.toggle('on', btn.dataset.v === k[group])
    }
  }
  setSwitch($('shyKnob'), k.shy)
  setSwitch($('toastKnob'), k.toast)

  for (const chip of document.querySelectorAll('.chip')) {
    chip.classList.toggle('on', chip.dataset.name === settings.preset)
  }
}

// Any knob edit re-derives the preset label: back to a named preset if the
// bundle matches one exactly, 'custom' otherwise.
const afterKnob = (immediate) => {
  settings.preset = wmPresetOf(settings.knobs)
  render()
  save(immediate)
}

// Each chip is a miniature rail drawn with the preset's own knobs, so the
// panel shows the themes instead of describing them.
const buildChips = () => {
  for (const [name, p] of Object.entries(WM_PRESETS)) {
    const chip = document.createElement('button')
    chip.className = 'chip'
    chip.dataset.name = name
    chip.title = name

    const mini = document.createElement('span')
    mini.className = 'mini'
    const rail = document.createElement('span')
    rail.className = 'mrail'
    const w = Math.max(3, Math.round(p.barWidth / 2.5))
    const r = Math.round(Math.min(p.radius, p.barWidth / 2) / 2.5)
    const h = Math.min(26, Math.round(p.base))
    rail.style.cssText =
      `width:${w}px;height:${h}px;border-radius:0 ${r}px ${r}px 0;` +
      `opacity:${p.presence};` +
      (p.finish === 'clear'
        ? 'background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.55)'
        : `background:${p.accent}`)
    mini.appendChild(rail)

    const label = document.createElement('span')
    label.className = 'name'
    label.textContent = name

    chip.append(mini, label)
    chip.addEventListener('click', () => {
      Object.assign(settings.knobs, p)
      settings.preset = name
      render()
      save(true)
    })
    $('presets').appendChild(chip)
  }
}

// ---- wiring ----

$('master').addEventListener('click', () => {
  settings.enabled = !settings.enabled
  render()
  save(true)
})

$('site').addEventListener('click', () => {
  if (!origin) return
  const list = settings.disabledSites
  const i = list.indexOf(origin)
  if (i >= 0) list.splice(i, 1)
  else list.push(origin)
  render()
  save(true)
})

for (const [key] of SLIDERS) {
  $(key).addEventListener('input', () => {
    settings.knobs[key] = Number($(key).value)
    afterKnob(false)
  })
}

$('accent').addEventListener('input', () => {
  settings.knobs.accent = $('accent').value
  settings.knobs.finish = 'tint' // picking a colour is choosing colour
  afterKnob(false)
})

$('accentReset').addEventListener('click', () => {
  settings.knobs.accent = WM_DEFAULTS.knobs.accent
  settings.knobs.finish = 'tint'
  afterKnob(true)
})

$('clear').addEventListener('click', () => {
  settings.knobs.finish = settings.knobs.finish === 'clear' ? 'tint' : 'clear'
  afterKnob(true)
})

for (const group of ['edges', 'align']) {
  for (const btn of document.querySelectorAll(`#${group} button`)) {
    btn.addEventListener('click', () => {
      settings.knobs[group] = btn.dataset.v
      render()
      save(true)
    })
  }
}

$('shyKnob').addEventListener('click', () => {
  settings.knobs.shy = !settings.knobs.shy
  render()
  save(true)
})

$('toastKnob').addEventListener('click', () => {
  settings.knobs.toast = !settings.knobs.toast
  render()
  save(true)
})

// chrome:// URLs cannot be ordinary links, and the binding shown must be the
// real one -- Chrome silently assigns nothing when the suggested key is taken.
$('changeKey').addEventListener('click', () =>
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
)

const init = async () => {
  const [{ settings: stored }, [tab]] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.tabs.query({ active: true, currentWindow: true })
  ])
  settings = wmMerge(stored)
  try {
    const u = new URL(tab.url)
    if (u.protocol === 'http:' || u.protocol === 'https:') origin = u.origin
  } catch (e) {
    /* no usable URL on this tab */
  }
  buildChips()
  render()
  chrome.commands.getAll((cmds) => {
    const of = (name) => cmds.find((x) => x.name === name)?.shortcut
    const parts = []
    if (of('toggle-rails')) parts.push(of('toggle-rails'))
    if (of('zoom-fit')) parts.push(of('zoom-fit') + ' fit')
    $('shortcut').textContent = parts.join(' · ') || 'no shortcuts set'
  })
}

init()
