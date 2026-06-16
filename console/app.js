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
  ['kept', '🔒ロック'],
]

async function loadState() {
  try {
    const res = await fetch('/api/state')
    const ct = res.headers.get('content-type') || ''
    if (!res.ok || !ct.includes('application/json')) throw new Error('no api')
    readOnly = false
    return await res.json()
  } catch {
    // 静的ホスト(bayalhost)では /api/state が HTML を返すのでここに来る
    readOnly = true
    const res = await fetch('./state.json', { cache: 'no-store' })
    return await res.json()
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
    if (filter === 'kept') return Boolean(state.keep?.[`${w.num}:${slot}`])
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

// 画像をロック/解除 (ロック中は一括処理で上書きされない)
async function toggleKeep(num, slot) {
  if (readOnly) return
  const key = `${num}:${slot}`
  const on = !state.keep?.[key]
  const res = await fetch('/api/keep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ num, slot, on }),
  })
  const data = await res.json()
  state.keep = data.keep
  render()
}

// その場で再検索→再取得し、画像を差し替える
async function redoNow(num, slot, btn) {
  if (readOnly) return
  btn.textContent = '⌛'
  btn.disabled = true
  try {
    const res = await fetch('/api/redo-now', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ num, slot }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (サーバを再起動?)')
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '画像取得に失敗')
    if (!state.images[num]) state.images[num] = {}
    state.images[num][slot] = data.image
    delete state.redo[`${num}:${slot}`]
    render()
  } catch (e) {
    btn.textContent = '⚠️'
    btn.title = String(e.message || e) // 失敗理由をツールチップに
    btn.disabled = false
  }
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
  const kept = Boolean(state.keep?.[`${num}:${slot}`])
  if (kept) thumb.classList.add('kept')
  label.appendChild(wspan)
  if (!readOnly && img) {
    const lock = document.createElement('button')
    lock.className = 'icon-btn'
    lock.textContent = kept ? '🔒' : '👍'
    lock.title = kept
      ? 'ロック中 (クリックで解除)'
      : 'この画像をロック (上書き防止)'
    lock.onclick = (e) => {
      e.stopPropagation()
      toggleKeep(num, slot)
    }
    label.appendChild(lock)
  }
  if (!readOnly && !kept) {
    const rerun = document.createElement('button')
    rerun.className = 'icon-btn'
    rerun.textContent = '🔄'
    rerun.title = '別の画像で取り直す'
    rerun.onclick = (e) => {
      e.stopPropagation()
      redoNow(num, slot, rerun)
    }
    label.appendChild(rerun)
  }
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
  let kept = 0
  for (const w of state.words) {
    for (const slot of SLOTS) {
      if (!w[slot]) continue
      total++
      const st = slotStatus(w.num, slot)
      if (st === 'has') has++
      if (st === 'flagged') flagged++
      if (state.keep?.[`${w.num}:${slot}`]) kept++
    }
  }
  const note = readOnly ? ' <span class="readonly-note">(閲覧専用)</span>' : ''
  document.getElementById(
    'stats'
  ).innerHTML = `画像 ${has}/${total} ・ 🔒 ${kept} ・ redo ${flagged}${note}`
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
