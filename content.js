// Runs on every page. Owns the content-column detector and the hover rails at
// the screen edges. The service worker drives zoom through messages, since only
// it can reach chrome.tabs. Loaded after defaults.js, which provides the
// settings shape (WM_DEFAULTS), the presets, and the merge helpers.

;(() => {
  if (window.__wmLoaded) return
  window.__wmLoaded = true

  const LOCKOUT_MS = 800 // after firing, ignore the edge until things settle

  // ---- settings ----

  // Defaults apply synchronously so the rails render sanely before the real
  // settings arrive from storage; the rails stay invisible until then anyway.
  let settings = wmMerge(null)

  const visible = () =>
    settings.enabled && !settings.disabledSites.includes(location.origin)

  // ---- detection ----

  const NOISE =
    /(^|[-_ ])(nav|header|footer|sidebar|side-bar|menu|banner|comment|advert|ads?|promo|cookie|modal|toolbar|breadcrumb)([-_ ]|$)/i

  const nameOf = (el) =>
    el.id + ' ' + (typeof el.className === 'string' ? el.className : '')

  const textLen = (el) => (el.innerText ? el.innerText.trim().length : 0)

  // Descend while a single child still holds nearly all of the text. This walks
  // past the stack of interchangeable wrapper divs and stops at the element
  // where content first branches into siblings -- the actual content column.
  const tighten = (el) => {
    for (let i = 0; i < 20; i++) {
      const total = textLen(el)
      if (total === 0) break
      const kid = [...el.children].find((c) => {
        const r = c.getBoundingClientRect()
        return textLen(c) >= total * 0.9 && r.width > 200 && r.height > 200
      })
      if (!kid) break
      el = kid
    }
    return el
  }

  const pick = () => {
    const scored = [
      ...document.querySelectorAll('main, [role="main"], article, section, div')
    ]
      .map((el) => {
        const r = el.getBoundingClientRect()
        const text = textLen(el)
        if (r.width < 200 || r.height < 200 || text < 200) return null
        if (NOISE.test(nameOf(el))) return null
        let score = text
        if (el.tagName === 'MAIN' || el.getAttribute('role') === 'main') score *= 3
        else if (el.tagName === 'ARTICLE') score *= 2
        return { el, score }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)

    return tighten(scored.length ? scored[0].el : document.body)
  }

  const describe = (el) => {
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/)[0]
        : ''
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls
  }

  // Every viewport width at which this page changes its layout, harvested from
  // its own @media rules. Cross-origin sheets throw on cssRules and are skipped.
  //
  // There is deliberately no fallback list of common framework widths. Guessing
  // is wrong in both directions: too low and it caps a page that had no
  // breakpoint at all, too high and it protects nothing. A single unreadable
  // stylesheet is enough to trigger it -- a CDN <link> without a crossorigin
  // attribute throws regardless of the CORS headers the CDN sends -- so a page
  // with no @media rules whatsoever still got capped by an invented one. What
  // is read here is only an opening guess; probing the result is the real check.
  let breakpointCache = null

  const readBreakpoints = () => {
    if (breakpointCache) return breakpointCache
    const found = new Set()
    const scan = (rules) => {
      for (const r of rules) {
        const text = r.conditionText || (r.media && r.media.mediaText) || ''
        const re = /\((?:max|min)-width:\s*([\d.]+)(px|em|rem)\)/g
        let m
        while ((m = re.exec(text))) {
          // em/rem in a media query resolve against the initial font size, not
          // the root element's.
          found.add(Math.round(parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16)))
        }
        if (r.cssRules) {
          try {
            scan(r.cssRules)
          } catch (e) {
            /* nested and unreadable */
          }
        }
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        scan(sheet.cssRules)
      } catch (e) {
        /* cross-origin without CORS */
      }
    }
    breakpointCache = [...found]
    return breakpointCache
  }

  // How many major vertical columns the page is currently showing. Losing a
  // sidebar changes this; posts streaming into a feed do not, which matters on
  // X where the timeline re-renders constantly. Left edges are clustered rather
  // than bucketed so that a column's nested wrappers collapse into one entry
  // instead of straddling a bucket boundary.
  const columnCount = () => {
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const lefts = []
    for (const el of document.querySelectorAll(
      'div,nav,aside,section,main,header,form'
    )) {
      const r = el.getBoundingClientRect()
      if (r.height < vh * 0.5) continue // too short to be a layout column
      if (r.width < 120) continue // slivers
      if (r.right <= 0 || r.left >= vw) continue // offscreen
      // Deliberately no upper width bound. Excluding wide elements by their
      // fraction of the viewport looks reasonable and is a trap: zoom shrinks
      // the viewport while a fixed-width container keeps its CSS width, so the
      // container's ratio climbs until it crosses the bound and drops out of
      // the count -- which reads as a lost column and backs off a page that was
      // perfectly fine. Full-bleed wrappers sit at left 0 and cluster together
      // anyway, contributing one stable entry.
      lefts.push(r.left)
    }
    lefts.sort((a, b) => a - b)
    let count = 0
    let prev = -Infinity
    for (const x of lefts) {
      if (x - prev > vw * 0.04) count++
      prev = x
    }
    return count
  }

  const toast = (msg) => {
    const old = document.getElementById('__wm_toast')
    if (old) old.remove()
    const t = document.createElement('div')
    t.id = '__wm_toast'
    // a live region, so screen readers hear what the zoom just did
    t.setAttribute('role', 'status')
    t.textContent = msg
    t.style.cssText = [
      'all:initial',
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'pointer-events:none',
      'font:500 13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#fff',
      'background:rgba(20,20,22,.92)',
      'padding:7px 12px',
      'border-radius:7px',
      'box-shadow:0 4px 16px rgba(0,0,0,.3)',
      'transition:opacity .3s'
    ].join(';')
    document.documentElement.appendChild(t)
    // Generous linger: on a wide monitor the eye has real distance to travel
    // from the hovered rail down to here, and toasts can be switched off
    // entirely -- so when they're on, they can afford to wait to be read.
    setTimeout(() => {
      t.style.opacity = '0'
    }, 4200)
    setTimeout(() => t.remove(), 4600)
  }

  // ---- hover rails ----

  const host = document.createElement('div')
  host.id = '__wm_rails'
  host.style.cssText =
    'all:initial;--z:1;position:fixed;inset:0;pointer-events:none;z-index:2147483645'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      /* Every px dimension is divided by --z, the live browser zoom factor.
         Browser zoom scales the whole page, and the rails live in the page, so
         without this the pill fattens the moment it does its job. Heights need
         no correction: they are in vh, and the viewport measured in CSS pixels
         shrinks by exactly the same factor.

         The --wm-* properties are the user's knobs, set on the host from
         storage; the fallbacks mirror WM_DEFAULTS. */
      .rail {
        --phi: 1.618;
        --rest: calc(var(--wm-base, 22vh) * var(--phi));   /* ~35.6vh at rest */
        --floor-base: calc(90px / var(--z));
        --floor: calc(var(--floor-base) * var(--phi));
        position: absolute;
        top: var(--wm-top, 50%);
        transform: translateY(-50%);
        height: var(--rest);
        min-height: var(--floor);
        width: calc(var(--wm-hit, 28px) / var(--z));
        display: flex;
        align-items: stretch;
        justify-content: center;
        pointer-events: auto;
        cursor: pointer;
        opacity: 0;
        transition:
          opacity .5s ease,
          height .24s cubic-bezier(.2,.8,.3,1),
          min-height .24s cubic-bezier(.2,.8,.3,1);
      }
      .rail.on { opacity: var(--wm-presence, 1) }
      .rail.l { left: 0 }
      .rail.r { right: 0 }
      /* Hovering grows the rail by phi rather than thickening it -- which also
         widens the target you are already aiming at, so the dwell is harder to
         slip off of by accident. */
      .rail:hover {
        height: calc(var(--rest) * var(--phi));            /* ~57.6vh on hover */
        min-height: calc(var(--floor) * var(--phi));
      }
      .bar {
        --r: calc(var(--wm-radius, 10px) / var(--z));
        position: relative;
        width: calc(var(--wm-bar, 20px) / var(--z));
        /* Square where it meets the screen edge, rounded where it leaves it. */
        border-radius: var(--r);
        overflow: hidden;
        background: rgba(128,128,128,.30);
        box-shadow: 0 0 0 calc(1px / var(--z)) rgba(255,255,255,.22);
        transition: background .16s ease;
      }
      .rail.l .bar { border-radius: 0 var(--r) var(--r) 0 }
      .rail.r .bar { border-radius: var(--r) 0 0 var(--r) }
      .rail:hover .bar { background: rgba(128,128,128,.5) }
      .fill {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--wm-accent, #2bbf9f) 25%, transparent) 0%,
          color-mix(in srgb, var(--wm-accent, #2bbf9f) 85%, transparent) 32%,
          var(--wm-core, #54d3b7) 50%,
          color-mix(in srgb, var(--wm-accent, #2bbf9f) 85%, transparent) 68%,
          color-mix(in srgb, var(--wm-accent, #2bbf9f) 25%, transparent) 100%
        );
        transform: scaleY(0);
        /* Grows from the middle out to both ends, so the bright core stays
           pinned at center and the falloff sweeps toward the edges. */
        transform-origin: center;
      }
      /* Linear on purpose: the fill is the dodge countdown, and an eased curve
         would misreport how much time is left to move away. */
      .rail.arming .fill {
        transform: scaleY(1);
        transition: transform var(--wm-dwell, 320ms) linear;
      }
      .rail.arming .bar {
        box-shadow:
          0 0 0 calc(1px / var(--z)) rgba(255,255,255,.22),
          0 0 calc(20px / var(--z)) color-mix(in srgb, var(--wm-accent, #2bbf9f) 65%, transparent);
        transition: box-shadow var(--wm-dwell, 320ms) ease-in;
      }
      /* The clear finish: no colour at all, just frosted glass. The bar blurs
         the page behind it, and the arming fill is plain light. */
      :host([data-finish="clear"]) .bar {
        background: rgba(255,255,255,.06);
        backdrop-filter: blur(4px) saturate(1.4) brightness(1.12);
        box-shadow: 0 0 0 calc(1px / var(--z)) rgba(255,255,255,.35);
      }
      :host([data-finish="clear"]) .rail:hover .bar {
        background: rgba(255,255,255,.14);
      }
      :host([data-finish="clear"]) .fill {
        background: linear-gradient(
          to bottom,
          rgba(255,255,255,.10) 0%,
          rgba(255,255,255,.45) 32%,
          rgba(255,255,255,.78) 50%,
          rgba(255,255,255,.45) 68%,
          rgba(255,255,255,.10) 100%
        );
      }
      :host([data-finish="clear"]) .rail.arming .bar {
        box-shadow:
          0 0 0 calc(1px / var(--z)) rgba(255,255,255,.35),
          0 0 calc(20px / var(--z)) rgba(255,255,255,.55);
      }
      /* Shy mode: the rail keeps its hit area but stays invisible until the
         pointer nears the edge. The fade is quicker than the resting one so
         the reveal keeps up with an approaching cursor. */
      :host([data-shy]) .rail {
        transition:
          opacity .3s ease,
          height .24s cubic-bezier(.2,.8,.3,1),
          min-height .24s cubic-bezier(.2,.8,.3,1);
      }
      :host([data-shy]) .rail.on { opacity: 0 }
      :host([data-shy]) .rail.on.near,
      :host([data-shy]) .rail.on:hover { opacity: var(--wm-presence, 1) }
      /* Reduced motion: the grow and the glow are decoration and go; the fill
         keeps its linear transition because it is the countdown -- information,
         not ornament. */
      @media (prefers-reduced-motion: reduce) {
        .rail { transition: opacity .5s ease }
        .rail.arming .bar { transition: none }
      }
    </style>
    <div class="rail l"><div class="bar"><div class="fill"></div></div></div>
    <div class="rail r"><div class="bar"><div class="fill"></div></div></div>
  `

  const rails = [...shadow.querySelectorAll('.rail')]
  let timer = null
  let lockedUntil = 0

  const disarm = (rail) => {
    clearTimeout(timer)
    timer = null
    rail.classList.remove('arming')
  }

  rails.forEach((rail) => {
    rail.addEventListener('pointerenter', () => {
      if (!visible() || Date.now() < lockedUntil || timer) return
      rail.classList.add('arming')
      timer = setTimeout(() => {
        disarm(rail)
        // Hold off re-firing while the zoom lands and the page reflows under
        // the cursor, which would otherwise bounce straight back off.
        lockedUntil = Date.now() + LOCKOUT_MS
        chrome.runtime.sendMessage({ type: 'zoom-fit' })
      }, settings.knobs.dwellMs)
    })
    rail.addEventListener('pointerleave', () => disarm(rail))
  })

  const showRails = (on) =>
    rails.forEach((r) => {
      r.classList.toggle('on', on)
      // Off must mean off: an invisible rail that still owns its hit area
      // would arm and zoom with no visual warning at all.
      r.style.pointerEvents = on ? 'auto' : 'none'
    })

  // Custom properties cross the shadow boundary, so setting --wm-* and --z on
  // the host is enough to restyle and resize everything inside it.
  let zoom = 1
  const setScale = (z) => {
    zoom = z > 0 ? z : 1
    host.style.setProperty('--z', zoom)
  }

  // ---- shy mode ----

  // The trigger distance is divided by the zoom factor so it stays physically
  // constant when the page is zoomed. The pointermove listener exists only
  // while shy is on and the rails are visible, and does no layout reads --
  // just a compare against a cached viewport width.
  const SHY_PX = 80
  let vw = window.innerWidth
  let shyWired = false
  const near = [false, false]

  const onShyMove = (e) => {
    const t = SHY_PX / zoom
    ;[e.clientX < t, e.clientX > vw - t].forEach((on, i) => {
      if (on === near[i]) return
      near[i] = on
      rails[i].classList.toggle('near', on)
    })
  }
  const onShyResize = () => {
    vw = window.innerWidth
  }
  const onShyLeave = () => {
    for (const i of [0, 1]) {
      near[i] = false
      rails[i].classList.remove('near')
    }
  }

  const syncShy = () => {
    host.toggleAttribute('data-shy', settings.knobs.shy)
    const want = settings.knobs.shy && visible()
    if (want === shyWired) return
    shyWired = want
    if (want) {
      addEventListener('pointermove', onShyMove, { passive: true })
      addEventListener('resize', onShyResize, { passive: true })
      document.documentElement.addEventListener('mouseleave', onShyLeave)
    } else {
      removeEventListener('pointermove', onShyMove)
      removeEventListener('resize', onShyResize)
      document.documentElement.removeEventListener('mouseleave', onShyLeave)
      onShyLeave()
    }
  }

  const applyKnobs = () => {
    const k = settings.knobs
    const s = host.style
    s.setProperty('--wm-base', k.base + 'vh')
    s.setProperty('--wm-bar', k.barWidth + 'px')
    s.setProperty('--wm-hit', k.barWidth + 8 + 'px')
    s.setProperty('--wm-radius', Math.min(k.radius, k.barWidth / 2) + 'px')
    s.setProperty('--wm-presence', k.presence)
    s.setProperty('--wm-dwell', k.dwellMs + 'ms')
    s.setProperty('--wm-accent', k.accent)
    s.setProperty('--wm-core', wmCore(k.accent))
    s.setProperty(
      '--wm-top',
      { high: '25%', middle: '50%', low: '75%' }[k.align] || '50%'
    )
    host.dataset.finish = k.finish
    rails[0].style.display = k.edges === 'right' ? 'none' : ''
    rails[1].style.display = k.edges === 'left' ? 'none' : ''
  }

  document.documentElement.appendChild(host)
  applyKnobs()

  chrome.storage.sync.get({ settings: null }, ({ settings: stored }) => {
    settings = wmMerge(stored)
    applyKnobs()
    showRails(visible())
    syncShy()
  })
  // Fires for the popup's edits and the ⌥⇧W toggle alike, on every open tab,
  // which is what makes the popup a live preview of the page behind it.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return
    settings = wmMerge(changes.settings.newValue)
    applyKnobs()
    showRails(visible())
    syncShy()
  })

  // The page may already carry a per-origin zoom the user set earlier, so ask
  // rather than assuming 1.
  chrome.runtime.sendMessage({ type: 'hello' }, (r) => {
    if (!chrome.runtime.lastError && r) setScale(r.z)
  })

  // ---- service worker interface ----

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'measure') {
      const el = pick()
      // Browser zoom shrinks the reported viewport but leaves an un-reflowed
      // element's width alone, so viewport/width is the correction factor
      // relative to the CURRENT zoom -- which makes the calculation iterative
      // and self-correcting across reflows.
      respond({
        width: el.getBoundingClientRect().width,
        viewport: document.documentElement.clientWidth,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
        label: describe(el),
        breakpoints: readBreakpoints(),
        cols: columnCount()
      })
    } else if (msg.type === 'toast') {
      // force carries direct feedback for a user action (the ⌥⇧W toggle),
      // which should land even when the chatty zoom toasts are turned off.
      if (msg.force || settings.knobs.toast) toast(msg.msg)
      respond(true)
    } else if (msg.type === 'scale') {
      setScale(msg.z)
      respond(true)
    }
    return false
  })
})()
