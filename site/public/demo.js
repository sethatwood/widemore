// The demo mirrors the extension's real behaviour and timings: 320ms linear
// dwell, glow easing in, an 800ms lockout after firing. No libraries.

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
    // the invitation has done its job
    document.getElementById('demoHint').classList.add('gone')
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
    // no hover on touch screens: a tap skips the dwell
    rail.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return
      if (Date.now() < lockedUntil) return
      fire()
    })
    // keyboard: the rails are buttons
    rail.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      if (Date.now() < lockedUntil) return
      fire()
    })
  })

  // ---- signup form: fetch when it can, plain POST when it can't ----

  const form = document.getElementById('signup')
  const note = document.getElementById('formNote')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button')
    btn.disabled = true
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
      const body = await res.json()
      note.textContent = body.message
      if (res.ok) form.reset()
    } catch (err) {
      note.textContent = 'could not reach the server — try again in a moment.'
    } finally {
      btn.disabled = false
    }
  })

  // the no-JS path lands back here with a flag in the query string
  const flag = new URLSearchParams(location.search).get('signup')
  if (flag === 'ok') note.textContent = "you're on the list."
  else if (flag) note.textContent = 'that did not go through — try again?'

  // evergreen copyright; the markup's year is only the no-JS fallback
  document.getElementById('year').textContent = new Date().getFullYear()
})()
