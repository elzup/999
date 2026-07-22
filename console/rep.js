// 代表語コンソール client。/api/state で候補(人 wh1-3/物 wm1-3)を読み、
// 番号ごとに代表順(①②)を決める。チップクリック=即確定(確定ボタンは無し)。
// 保存は /api/rep へ POST。

let state = null
let filter = 'all'
let hideConfirmed = false
let focusNum = null

const KIND_LABEL = { hito: '人', mono: '物' }
const FILTERS = [
  ['all', 'すべて'],
  ['multi', '2択+'],
  ['sameKind', '同種ペア'],
  ['mono1', '物優先'],
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
  const w = byNum(num)
  if (w && !saved.error) {
    w.order = saved.order
    w.confirmed = saved.confirmed
    w.stale = [] // 保存で pick を取り直したのでズレは解消
  }
  return saved
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
  if (filter === 'stale') return w.stale && w.stale.length > 0
  return true
}

function visibleWords() {
  return state.words.filter(matchesFilter)
}

function move(dir) {
  const list = visibleWords()
  const idx = list.findIndex((w) => w.num === focusNum)
  const cols = Math.max(1, Math.floor(gridEl.clientWidth / 232))
  const delta = { left: -1, right: 1, up: -cols, down: cols }[dir]
  const next = idx + delta
  if (next >= 0 && next < list.length) {
    focusNum = list[next].num
    render()
    document
      .querySelector(`.card[data-num="${focusNum}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }
}

const gridEl = document.getElementById('grid')
const statEl = document.getElementById('stat')
const emptyEl = document.getElementById('empty')

function renderStat() {
  const ws = state.words
  const total = ws.length
  const confirmed = ws.filter((w) => w.confirmed).length
  const multi = ws.filter((w) => w.cands.length >= 2).length
  const remain = ws.filter((w) => !w.confirmed).length
  const stale = ws.filter((w) => w.stale && w.stale.length).length
  statEl.innerHTML =
    `確定 <b class="g">${confirmed}</b>/<b>${total}</b>` +
    ` ・ 残 <b>${remain}</b>` +
    ` ・ 2択+ <b>${multi}</b>` +
    (stale ? ` ・ <b style="color:var(--amber)">⚠${stale}</b>` : '')
}

function devColor(dev) {
  if (dev >= 60) return 'var(--green)'
  if (dev >= 50) return 'var(--blue)'
  if (dev >= 42) return 'var(--amber)'
  return 'var(--red)'
}

function meterHtml(cand) {
  const c = devColor(cand.dev)
  return `<span class="meter" title="score ${cand.score} / 偏差値 ${cand.dev}">
      <span class="meter-bar"><span class="meter-fill" style="width:${cand.dev}%;background:${c}"></span></span>
      <span class="meter-dev" style="color:${c}">${cand.dev}</span>
    </span>`
}

function chipHtml(w, cand) {
  const rank = w.order.indexOf(cand.slot) // 0=①, 1=②, -1=未
  const rankCls = rank === 0 ? 'rank1' : rank === 1 ? 'rank2' : ''
  const rankTxt = rank === 0 ? '①' : rank === 1 ? '②' : '·'
  const thumb = cand.img
    ? `<img class="chip-img" src="${escapeHtml(
        cand.img
      )}" loading="lazy" alt="" />`
    : `<span class="chip-img none">no img</span>`
  return `<div class="chip ${rankCls}" data-num="${w.num}" data-slot="${
    cand.slot
  }">
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
        ${meterHtml(cand)}
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
  gridEl.innerHTML = list.map(cardHtml).join('')
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
  const chip = e.target.closest('.chip')
  if (chip) {
    focusNum = chip.dataset.num
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
    if (cand) return void (e.preventDefault(), tapChip(focusNum, cand.slot))
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
