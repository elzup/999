// 画像コンソール gallery。/api/state があればサーバ運用(redo 書込可)、
// 無ければ ./state.json を読む静的(閲覧専用)モードにフォールバックする。

let state = null
let readOnly = false
let filter = 'all'

const SLOTS = ['w1', 'w2']
const FILTERS = [
  ['all', 'すべて'],
  ['has', '画像あり'],
  ['missing', '未取得'],
  ['flagged', 'redo'],
]

async function loadState() {
  try {
    const res = await fetch('/api/state')
    if (!res.ok) throw new Error('no api')
    readOnly = false
    return res.json()
  } catch {
    readOnly = true
    const res = await fetch('./state.json')
    return res.json()
  }
}

function slotStatus(num, slot) {
  const key = `${num}:${slot}`
  const hasImg = Boolean(state.images?.[num]?.[slot])
  const flagged = Boolean(state.redo?.[key])
  const cand = state.candidates?.[key]
  if (flagged) return 'flagged'
  if (hasImg) return 'has'
  if (cand?.status === 'error') return 'error'
  return 'missing'
}

function cardMatchesFilter(w) {
  if (filter === 'all') return true
  return SLOTS.some((slot) => {
    if (!w[slot]) return false
    const st = slotStatus(w.num, slot)
    if (filter === 'has') return st === 'has'
    if (filter === 'missing') return st === 'missing' || st === 'error'
    if (filter === 'flagged') return st === 'flagged'
    return true
  })
}

async function toggleRedo(num, slot) {
  if (readOnly) return
  const key = `${num}:${slot}`
  const on = !state.redo?.[key]
  const res = await fetch('/api/redo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ num, slot, on }),
  })
  const data = await res.json()
  state.redo = data.redo
  render()
}

function slotEl(w, slot) {
  const num = w.num
  const word = w[slot]
  const img = state.images?.[num]?.[slot]
  const st = slotStatus(num, slot)

  const wrap = document.createElement('div')
  wrap.className = 'slot'

  const thumb = document.createElement('div')
  thumb.className = 'thumb' + (st === 'flagged' ? ' flagged' : '')
  if (img) {
    const i = document.createElement('img')
    i.loading = 'lazy'
    i.src = img.url
    thumb.appendChild(i)
  } else {
    thumb.textContent = st === 'error' ? '取得失敗' : '未取得'
  }
  thumb.title = readOnly ? '' : 'クリックで redo トグル'
  thumb.onclick = () => toggleRedo(num, slot)
  wrap.appendChild(thumb)

  const label = document.createElement('div')
  label.className = 'slot-label'
  const wspan = document.createElement('span')
  wspanText(wspan, slot, word)
  const badge = document.createElement('span')
  badge.className = 'badge b-' + st
  label.appendChild(wspan)
  label.appendChild(badge)
  wrap.appendChild(label)
  return wrap
}

function wspanText(span, slot, word) {
  span.className = 'word'
  span.textContent = `${slot}: ${word}`
}

function render() {
  const grid = document.getElementById('grid')
  grid.innerHTML = ''
  const cards = state.words.filter(cardMatchesFilter)
  for (const w of cards) {
    const card = document.createElement('div')
    card.className = 'card'
    const num = document.createElement('div')
    num.className = 'card-num'
    num.textContent = w.num
    card.appendChild(num)
    for (const slot of SLOTS) {
      if (w[slot]) card.appendChild(slotEl(w, slot))
    }
    grid.appendChild(card)
  }
  renderStats()
}

function renderStats() {
  let has = 0
  let total = 0
  let flagged = 0
  for (const w of state.words) {
    for (const slot of SLOTS) {
      if (!w[slot]) continue
      total++
      const st = slotStatus(w.num, slot)
      if (st === 'has') has++
      if (st === 'flagged') flagged++
    }
  }
  const note = readOnly ? ' <span class="readonly-note">(閲覧専用)</span>' : ''
  document.getElementById(
    'stats'
  ).innerHTML = `画像 ${has}/${total} ・ redo ${flagged}${note}`
}

function renderFilters() {
  const box = document.getElementById('filters')
  box.innerHTML = ''
  for (const [key, label] of FILTERS) {
    const b = document.createElement('button')
    b.textContent = label
    b.className = key === filter ? 'active' : ''
    b.onclick = () => {
      filter = key
      renderFilters()
      render()
    }
    box.appendChild(b)
  }
}
async function main() {
  state = await loadState()
  renderFilters()
  render()
}
main()
