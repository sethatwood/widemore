// The practice run. Mirrors the extension's real behaviour and timings:
// 320ms linear dwell, glow easing in, an 800ms lockout after firing.

;(() => {
  const page = document.getElementById('demoPage')
  const toastEl = document.getElementById('demoToast')
  const rails = [...document.querySelectorAll('.demo-rail')]

  const DWELL_MS = 320
  const LOCKOUT_MS = 800

  let zoomed = false
  let timer = null
  let lockedUntil = 0
  let toastTimer = null

  const toast = (msg) => {
    clearTimeout(toastTimer)
    toastEl.textContent = msg
    toastEl.classList.add('show')
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200)
  }

  const disarm = (rail) => {
    clearTimeout(timer)
    timer = null
    rail.classList.remove('arming')
  }

  const fire = () => {
    zoomed = !zoomed
    page.classList.toggle('zoomed', zoomed)
    toast(zoomed ? 'widemore: article → 172%' : 'widemore: zoom reset')
    lockedUntil = Date.now() + LOCKOUT_MS
  }

  rails.forEach((rail) => {
    rail.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return // touch fires on tap instead
      if (Date.now() < lockedUntil || timer) return
      rail.classList.add('arming')
      timer = setTimeout(() => {
        disarm(rail)
        fire()
      }, DWELL_MS)
    })
    rail.addEventListener('pointerleave', () => disarm(rail))
    rail.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return
      if (Date.now() < lockedUntil) return
      fire()
    })
    rail.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      if (Date.now() < lockedUntil) return
      fire()
    })
  })
})()
