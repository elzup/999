// 代表語コンソール client。/api/state で候補(人 wh1-3/物 wm1-3)を読み、
// 番号ごとに代表順(①②)を決める。チップクリック=即確定(確定ボタンは無し)。
// 保存は /api/rep へ POST。

import { applySavedRep, applySavedScore } from './rep-state.js'

let state = null
let filter = 'all'
let hideConfirmed = false
let focusNum = null
let focusSlot = null

const KIND_LABEL = { hito: '人', mono: '物' }
// 主観評価。key は候補にフォーカス中に押す(z=却下 … v=最高)
const RATINGS = [
  [-1, '-1', 'z', '却下'],
  [0, '0', 'x', '普通'],
  [1, '+1', 'c', '良い'],
  [2, '+2', 'v', '最高'],
]
const RATE_KEYS = Object.fromEntries(RATINGS.map(([v, , key]) => [key, v]))
// 未評価の既定値。表示上は 0(普通) が選ばれている状態にする
const DEFAULT_RATE = 0
const FILTERS = [
  ['all', 'すべて'],
  ['multi', '2択+'],
  ['sameKind', '同種ペア'],
  ['mono1', '物優先'],
  ['unrated', '未評価'],
  ['stale', '⚠要再確認'],
]

const byNum = (num) => state.words.find((w) => w.num === num)
const candBySlot = (w, slot) => w.cands.find((c) => c.slot === slot)

async function load() {
  const res = await fetch('/api/state')
  state = await res.json()
  render()
}

async function saveRep(num, order) {
  const res = await fetch('/api/rep', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ num, order, confirmed: true }),
  })
  const saved = await res.json()
  if (res.ok) state = applySavedRep(state, num, saved)
  return saved
}

// 評価は代表とは独立。同じ値を再度押したら未評価に戻す (トグル)。
async function saveScore(num, slot, v) {
  const w = byNum(num)
  const cand = w && candBySlot(w, slot)
  if (!cand) return
  const next = cand.rate === v ? null : v
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ num, slot, v: next }),
  })
  const saved = await res.json()
  if (res.ok) state = applySavedScore(state, num, slot, saved)
  render()
}

// チップクリック = その候補を代表①へ繰り上げて即確定。
// ①をクリックした場合は順序そのままで確定(=1クリックで確定できる)。②以降は繰り上げ。
// 並びは [クリック, ...残り] を最大2枠。②の入替は ⇅(swap) で。
function tapChip(num, slot) {
  const w = byNum(num)
  if (!w || !candBySlot(w, slot)) return
  const next = [slot, ...w.order.filter((s) => s !== slot)].slice(0, 2)
  saveRep(num, next).then(render)
}

function swap(num) {
  const w = byNum(num)
  if (!w || w.order.length < 2) return
  saveRep(num, [...w.order].reverse()).then(render)
}

function confirmNext(num) {
  const w = byNum(num)
  if (!w) return
  saveRep(num, w.order).then(() => {
    const list = visibleWords()
    const idx = list.findIndex((x) => x.num === num)
    const next =
      list.slice(idx + 1).find((x) => !x.confirmed) || list[idx + 1] || null
    focusNum = next ? next.num : num
    render()
  })
}

function sameKindPair(w) {
  return (
    w.order.length === 2 &&
    candBySlot(w, w.order[0])?.kind === candBySlot(w, w.order[1])?.kind
  )
}

function matchesFilter(w) {
  if (hideConfirmed && w.confirmed) return false
  if (filter === 'all') return true
  if (filter === 'multi') return w.cands.length >= 2
  if (filter === 'sameKind') return sameKindPair(w)
  if (filter === 'mono1') return candBySlot(w, w.order[0])?.kind === 'mono'
  if (filter === 'unrated') return w.rated < w.cands.length
  if (filter === 'stale')
    return (w.stale?.length || 0) + (w.rateStale?.length || 0) > 0
  return true
}

function visibleWords() {
  return state.words.filter(matchesFilter)
}

function move(dir) {
  const list = visibleWords()
  const idx = list.findIndex((w) => w.num === focusNum)
  // 列幅は CSS 側 (minmax) が決めるので、実際のカード幅から数える
  const cols = Math.max(1, countColumns())
  const delta = { left: -1, right: 1, up: -cols, down: cols }[dir]
  const next = idx + delta
  if (next >= 0 && next < list.length) {
    focusNum = list[next].num
    focusSlot = list[next].cands[0]?.slot ?? null // カードを跨いだら先頭候補に戻す
    render()
  }
}

const gridEl = document.getElementById('grid')
const statEl = document.getElementById('stat')
const emptyEl = document.getElementById('empty')

/** グリッドの実際の列数。カード幅を CSS 側だけで変えられるようにする */
function countColumns() {
  const template = getComputedStyle(gridEl).gridTemplateColumns
  return template ? template.split(' ').filter(Boolean).length : 1
}

function renderStat() {
  const ws = state.words
  const total = ws.length
  const confirmed = ws.filter((w) => w.confirmed).length
  const multi = ws.filter((w) => w.cands.length >= 2).length
  const remain = ws.filter((w) => !w.confirmed).length
  const stale = ws.filter(
    (w) => (w.stale?.length || 0) + (w.rateStale?.length || 0)
  ).length
  const cands = ws.reduce((a, w) => a + w.cands.length, 0)
  const rated = ws.reduce((a, w) => a + w.rated, 0)
  statEl.innerHTML =
    `確定 <b class="g">${confirmed}</b>/<b>${total}</b>` +
    ` ・ 残 <b>${remain}</b>` +
    ` ・ 2択+ <b>${multi}</b>` +
    ` ・ 評価 <b class="g">${rated}</b>/<b>${cands}</b>` +
    (stale ? ` ・ <b style="color:var(--amber)">⚠${stale}</b>` : '')
}

// rankey の記号 → 色クラス。数値スコアの代わりに、記号そのものの色で質を読む。
// x(拗音) は減点ではないので A/B と同じ良い側の色に置く。
const RK_CLASS = {
  A: 'k-a',
  B: 'k-b',
  C: 'k-c',
  w: 'k-w',
  x: 'k-x',
  t: 'k-t',
  v: 'k-v',
  _: 'k-u',
  '!': 'k-o',
  '|': 'k-s',
  n: 'k-f',
  '-': 'k-f',
  '.': 'k-f',
  m: 'k-m',
}

function rankeyHtml(cand) {
  if (!cand.rk) return ''
  const body = [...cand.rk]
    .map((c) => `<span class="${RK_CLASS[c] || ''}">${escapeHtml(c)}</span>`)
    .join('')
  return `<span class="rk" title="rankey ${cand.rk} / pt ${cand.score}">${body}</span>`
}

function rateHtml(w, cand) {
  // 未評価は 0(普通) 扱いで表示する。保存されるのは明示的に押した値だけ
  const shown = cand.rate ?? DEFAULT_RATE
  const buttons = RATINGS.map(
    ([v, label, key, title]) =>
      `<button class="rate r${v < 0 ? 'neg' : v} ${
        shown === v ? 'on' : ''
      }" data-num="${w.num}" data-slot="${
        cand.slot
      }" data-v="${v}" title="${title} (${key})">${label}</button>`
  ).join('')
  return `<span class="rates">${buttons}</span>`
}

function chipHtml(w, cand) {
  const rank = w.order.indexOf(cand.slot) // 0=①, 1=②, -1=未
  const rankCls = rank === 0 ? 'rank1' : rank === 1 ? 'rank2' : ''
  const rankTxt = rank === 0 ? '①' : rank === 1 ? '②' : '·'
  const focusCls =
    w.num === focusNum && cand.slot === focusSlot ? ' chipfocus' : ''
  const thumb = cand.img
    ? `<img class="chip-img" src="${escapeHtml(
        cand.img
      )}" loading="lazy" alt="" />`
    : `<span class="chip-img none">no img</span>`
  return `<div class="chip ${rankCls}${focusCls}" data-num="${
    w.num
  }" data-slot="${cand.slot}">
      <span class="rankbadge">${rankTxt}</span>
      ${thumb}
      <span class="chip-body">
        <span class="chip-top">
          <span class="kindmark ${cand.kind}">${KIND_LABEL[cand.kind]}${
    cand.rank
  }</span>
          <span class="chip-k">${escapeHtml(cand.k)}</span>
        </span>
        <span class="chip-w">${escapeHtml(cand.word || '—')}</span>
        ${rankeyHtml(cand)}
        ${rateHtml(w, cand)}
      </span>
    </div>`
}

function cardHtml(w) {
  const cls = [
    'card',
    w.confirmed ? 'confirmed' : '',
    w.stale && w.stale.length ? 'stale' : '',
    w.num === focusNum ? 'focus' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const tag = w.stale?.length
    ? '<span class="tag warn">要再確認</span>'
    : w.auto
    ? '<span class="tag auto">自動</span>'
    : w.confirmed
    ? '<span class="tag ok">確定</span>'
    : ''
  const swapBtn =
    w.order.length >= 2
      ? `<button class="swap" data-num="${w.num}" title="①②入替 (s)">⇅</button>`
      : ''
  return `<div class="${cls}" data-num="${w.num}" tabindex="0">
      <div class="card-head"><span class="card-num">${
        w.num
      }</span>${tag}<span class="head-sp"></span>${swapBtn}</div>
      <div class="chips">${w.cands.map((c) => chipHtml(w, c)).join('')}</div>
    </div>`
}

function render() {
  renderStat()
  const list = visibleWords()
  emptyEl.hidden = list.length > 0
  // innerHTML の入れ替えでスクロール位置が飛ぶ。評価は連続して押すので、
  // 押すたびに画面が動くと作業にならない。位置は据え置く。
  const y = window.scrollY
  gridEl.innerHTML = list.map(cardHtml).join('')
  if (window.scrollY !== y) window.scrollTo(0, y)
}

function renderFilters() {
  document.getElementById('filters').innerHTML = FILTERS.map(
    ([k, label]) =>
      `<button data-f="${k}" class="${
        k === filter ? 'active' : ''
      }">${label}</button>`
  ).join('')
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  )
}

// --- events ---
gridEl.addEventListener('click', (e) => {
  // 評価ボタンは代表繰り上げより先に拾う (chip の内側にあるため)
  const rate = e.target.closest('.rate')
  if (rate) {
    focusNum = rate.dataset.num
    focusSlot = rate.dataset.slot
    return void saveScore(rate.dataset.num, rate.dataset.slot, +rate.dataset.v)
  }
  const chip = e.target.closest('.chip')
  if (chip) {
    focusNum = chip.dataset.num
    focusSlot = chip.dataset.slot
    return tapChip(chip.dataset.num, chip.dataset.slot)
  }
  const swapBtn = e.target.closest('.swap')
  if (swapBtn) {
    focusNum = swapBtn.dataset.num
    return swap(swapBtn.dataset.num)
  }
  const card = e.target.closest('.card')
  if (card) {
    focusNum = card.dataset.num
    render()
  }
})

document.getElementById('filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button')
  if (!btn) return
  filter = btn.dataset.f
  renderFilters()
  const list = visibleWords()
  if (!list.some((w) => w.num === focusNum)) focusNum = list[0]?.num ?? null
  render()
})

const hideToggle = document.getElementById('hideConfirmed')
hideToggle.addEventListener('change', () => {
  hideConfirmed = hideToggle.checked
  const list = visibleWords()
  if (!list.some((w) => w.num === focusNum)) focusNum = list[0]?.num ?? null
  render()
})

document.getElementById('bulkBtn').addEventListener('click', async () => {
  const targets = visibleWords().filter((w) => !w.confirmed)
  if (!targets.length) return
  if (!confirm(`表示中の未確定 ${targets.length} 件を現在の順で確定しますか?`))
    return
  for (const w of targets) await saveRep(w.num, w.order)
  render()
})

window.addEventListener('keydown', (e) => {
  if (!focusNum) return
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
  const w = byNum(focusNum)
  const key = e.key
  if (key >= '1' && key <= '6') {
    const cand = w?.cands[Number(key) - 1]
    if (cand) {
      focusSlot = cand.slot
      return void (e.preventDefault(), tapChip(focusNum, cand.slot))
    }
  }
  // 評価キー: フォーカス中の候補 (未指定なら先頭) に適用
  if (key in RATE_KEYS) {
    const cand = (w && candBySlot(w, focusSlot)) || w?.cands[0]
    if (cand) {
      focusSlot = cand.slot
      return void (e.preventDefault(),
      saveScore(focusNum, cand.slot, RATE_KEYS[key]))
    }
  }
  // Tab: カード内の候補フォーカスを送る (評価キーの対象を切り替える)
  if (key === 'Tab' && w?.cands.length) {
    e.preventDefault()
    const i = w.cands.findIndex((c) => c.slot === focusSlot)
    const step = e.shiftKey ? -1 : 1
    focusSlot =
      w.cands[(i + step + w.cands.length) % w.cands.length]?.slot ??
      w.cands[0].slot
    return void render()
  }
  if (key === 's') return void (e.preventDefault(), swap(focusNum))
  if (key === 'Enter' || key === ' ')
    return void (e.preventDefault(), confirmNext(focusNum))
  const dirs = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  }
  if (dirs[key]) return void (e.preventDefault(), move(dirs[key]))
})

renderFilters()
load()
