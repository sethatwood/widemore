// Replays the content-column detector from content.js against modelled pages.
//
// The detector reads a live DOM, so this harness re-states its two descent
// rules against a tree of plain objects instead of importing it. That makes it
// a contract: if you change tighten() or sameColumn() in content.js, change the
// replay to match, or the assertions below will tell on you. The constants
// mirror content.js and must be kept in lockstep.
//
// A page is modelled as nested boxes, each with a width, a left edge, its own
// padding, and the length of the text it holds directly. Everything the
// detector asks a real element -- its rect, its content box, how much of the
// text is under it -- is answered from that.
//
// Run: node test/detect.test.js

const MOST = 0.9
const AGREE = 0.02

// ---- the model ----

const box = (o) => ({ width: 0, left: 0, pad: 0, height: 400, own: 0, kids: [], ...o })

const textLen = (b) => b.own + b.kids.reduce((n, k) => n + textLen(k), 0)
const contentWidth = (b) => b.width - 2 * b.pad
const describe = (b) => b.name || 'div'

// ---- the rules, as content.js states them ----

function sameColumn (el, total) {
  const kids = el.kids
    .map((c) => ({ el: c, text: textLen(c), width: c.width, left: c.left }))
    .filter((k) => k.text > 0 && k.width > 200)
    .sort((a, b) => b.text - a.text)

  let carried = 0
  let n = 0
  while (n < kids.length && carried < total * MOST) carried += kids[n++].text
  if (carried < total * MOST || n < 2) return null

  const set = kids.slice(0, n)
  const widths = set.map((k) => k.width)
  const wide = Math.max(...widths)
  const slack = wide * AGREE
  if (wide - Math.min(...widths) > slack) return null
  if (Math.max(...set.map((k) => k.left)) - Math.min(...set.map((k) => k.left)) > slack) {
    return null
  }
  if (wide > contentWidth(el) * (1 - AGREE)) return null

  return kids[0].el
}

function tighten (el) {
  for (let i = 0; i < 20; i++) {
    const total = textLen(el)
    if (total === 0) break
    const kid = el.kids.find(
      (c) => textLen(c) >= total * MOST && c.width > 200 && c.height > 200
    )
    if (!kid) return sameColumn(el, total) || el
    el = kid
  }
  return el
}

// ---- assertions ----

let failures = 0

function run (name, page, checks) {
  console.log(name)
  checks(tighten(page))
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

// A stack of sections, each centred at `width` inside a full-bleed shell.
const stacked = (shell, width, shares) =>
  box({
    name: 'main',
    width: shell,
    left: 0,
    kids: shares.map((own, i) =>
      box({ name: 'section' + i, width, left: (shell - width) / 2, pad: 24, own })
    )
  })

// ---- the cases worth keeping ----

run('stacked sections: the shell is not the column', stacked(1920, 1060, [400, 300, 250, 200, 150]), (el) => {
  assert(el.width === 1060, 'measures the section, not the 1920px shell')
  assert(describe(el) === 'section0', 'names the section carrying the most text')
})

run('one padded prose wrapper: padding is not a column', {
  // widemore.page/privacy: main is max-width'd AND padded, and its paragraphs
  // simply fill what is left. Descending would measure the padding away and
  // report the same page differently depending on how deep that padding sat.
  ...box({
    name: 'main',
    width: 685,
    left: 617,
    pad: 77,
    kids: [
      box({ name: 'p0', width: 531, left: 694, own: 400 }),
      box({ name: 'p1', width: 531, left: 694, own: 380 }),
      box({ name: 'p2', width: 531, left: 694, own: 300 })
    ]
  })
}, (el) => {
  assert(el.width === 685, 'stays on the wrapper')
  assert(describe(el) === 'main', 'and keeps its name')
})

run('three-across card grid: a row is not a column', {
  ...box({
    name: 'section',
    width: 1060,
    left: 430,
    kids: [
      box({ name: 'card0', width: 330, left: 430, own: 300 }),
      box({ name: 'card1', width: 330, left: 795, own: 300 }),
      box({ name: 'card2', width: 330, left: 1160, own: 300 })
    ]
  })
}, (el) => {
  assert(el.width === 1060, 'does not follow a card and zoom to 3x the column')
  assert(describe(el) === 'section', 'stops at the row that holds them')
})

run('classic article: single-child descent still runs', {
  ...box({
    name: 'main',
    width: 1920,
    left: 0,
    kids: [
      box({
        name: 'article',
        width: 760,
        left: 580,
        kids: [
          box({ name: 'p0', width: 760, left: 580, own: 500 }),
          box({ name: 'p1', width: 760, left: 580, own: 480 })
        ]
      })
    ]
  })
}, (el) => {
  assert(el.width === 760, 'walks the wrapper stack down to the article')
  assert(describe(el) === 'article', 'and stops where the paragraphs branch')
})

run('sidebar beside content: widths disagree, nothing to learn', {
  ...box({
    name: 'main',
    width: 1920,
    left: 0,
    kids: [
      box({ name: 'aside', width: 300, left: 0, own: 300 }),
      box({ name: 'content', width: 1620, left: 300, own: 900 })
    ]
  })
}, (el) => {
  assert(el.width === 1920, 'leaves the two-column layout alone')
  assert(describe(el) === 'main', 'main already uses the window and says so')
})

run('left-aligned blocks of different widths: not one column', {
  // Both start at the same edge and both are narrower than the shell, so the
  // stacking test and the content-box test would each wave these through; it
  // is the width that says they are two different things.
  ...box({
    name: 'main',
    width: 1920,
    left: 0,
    kids: [
      box({ name: 'figures', width: 1200, left: 0, own: 500 }),
      box({ name: 'prose', width: 900, left: 0, own: 700 })
    ]
  })
}, (el) => {
  assert(el.width === 1920, 'refuses to call either one the column')
  assert(describe(el) === 'main', 'stops on the shell')
})

run('text loose in the shell: the sections do not hold the page', {
  // Half the text sits directly in the shell, so the sections between them
  // account for too little of it to speak for the page. Taking one would
  // measure a box holding a third of what is on screen.
  ...box({
    name: 'main',
    width: 1920,
    left: 0,
    own: 900,
    kids: [
      box({ name: 'section0', width: 1000, left: 460, own: 300 }),
      box({ name: 'section1', width: 1000, left: 460, own: 300 }),
      box({ name: 'section2', width: 1000, left: 460, own: 300 })
    ]
  })
}, (el) => {
  assert(el.width === 1920, 'leaves the shell alone')
  assert(describe(el) === 'main', 'and says so')
})

run('the sibling rule is the last step', {
  // Once a section stands in for the set, it speaks only for its own share of
  // the text, so the single-child rule must not run on from there. This is
  // widemore.page on a wide monitor: the sections pad by 4vw, and descending
  // one more step would hand back a column the width of that padding.
  ...box({
    name: 'main',
    width: 3440,
    left: 0,
    kids: [
      box({
        name: 'section0',
        width: 1060,
        left: 1190,
        pad: 137,
        kids: [
          box({ name: 'h2', width: 786, left: 1327, own: 12 }),
          box({ name: 'beats', width: 786, left: 1327, own: 400 })
        ]
      }),
      box({ name: 'section1', width: 1060, left: 1190, pad: 137, own: 300 }),
      box({ name: 'section2', width: 1060, left: 1190, pad: 137, own: 200 })
    ]
  })
}, (el) => {
  assert(el.width === 1060, 'measures the section, not its content box')
  assert(describe(el) === 'section0', 'and stops there')
})

run('feed of many small posts: no column to find', {
  // 20 posts, none of them close to carrying the page; the fewest that do is
  // most of the feed, and a feed is not a repeated max-width.
  ...box({
    name: 'main',
    width: 1920,
    left: 0,
    pad: 0,
    kids: Array.from({ length: 20 }, (_, i) =>
      box({ name: 'post' + i, width: 600 + i * 40, left: 100 + i * 5, own: 100 })
    )
  })
}, (el) => {
  assert(describe(el) === 'main', 'left alone: the posts agree on nothing')
})

run('nested shells: descends through both', {
  // shell > shell > sections. The single-child rule walks the outer shells,
  // then the sibling rule takes the sections.
  ...box({
    name: 'body',
    width: 1920,
    left: 0,
    kids: [stacked(1920, 1200, [500, 400, 300])]
  })
}, (el) => {
  assert(el.width === 1200, 'reaches the section under two full-bleed shells')
})

process.exit(failures ? 1 : 0)
