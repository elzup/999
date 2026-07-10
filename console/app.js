// 画像コンソール gallery。/api/state があればサーバ運用(redo 書込可)、
// 無ければ ./state.json を読む静的(閲覧専用)モードにフォールバックする。

let state = null
let readOnly = false
let filter = 'all'
// Triple toggle: all(全部) | draft(下書き=未確定+今回ロック) | unconf(未確定のみ)
// クリックで切れるのは all / unconf のみ。draft は unconf でロックすると自動遷移。
let lockView = 'all'
const sessionLocks = new Set() // 今回のレビューでロックしたキー (下書き表示用)

// 優先順位順。w1_2/w2_2 は片方が空のときだけ値が入る (2枠目の穴埋め)
const SLOTS = ['w1', 'w2', 'w1_2', 'w2_2']
const FILTERS = [
  ['all', 'すべて'],
  ['unconfirmed', '未確定'],
  ['kept', '🔒確定'],
  ['missing', '未取得'],
  ['flagged', 'redo'],
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
    if (filter === 'unconfirmed')
      return st === 'has' && !state.keep?.[`${w.num}:${slot}`]
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
  if (on) {
    sessionLocks.add(key)
    // 未確定のみ表示中にロック → 自動で下書きへ (ロックした画像は残す)
    if (lockView === 'unconf') lockView = 'draft'
  } else {
    sessionLocks.delete(key)
  }
  // 即時には消さない: そのスロットの見た目だけ更新 (再フィルタは次の render で)
  refreshSlot(num, slot)
  renderLockView()
  renderStats()
}

// 1スロットだけ DOM を作り直す (グリッドのフィルタは再適用しない)
function refreshSlot(num, slot) {
  const old = document.querySelector(`.slot[data-key="${num}:${slot}"]`)
  if (!old) return
  const w = state.words.find((x) => x.num === num)
  if (w) old.replaceWith(slotEl(w, slot))
}

// その場で再検索→再取得し、今の画像と2択で選ばせる
async function redoNow(num, slot, btn) {
  if (readOnly) return
  const oldImg = state.images?.[num]?.[slot] || null
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
    state.images[num][slot] = data.image // 新を一旦採用
    delete state.redo[`${num}:${slot}`]
    if (oldImg && oldImg.url !== data.image.url) {
      showChooser(num, slot, oldImg, data.image) // 今の画像と2択
    } else {
      refreshSlot(num, slot)
    }
  } catch (e) {
    btn.textContent = '⚠️'
    btn.title = String(e.message || e) // 失敗理由をツールチップに
    btn.disabled = false
  }
}

// 元画像から上寄せでクロップし直す (固定アクション)
async function recropTop(num, slot, btn) {
  if (readOnly) return
  btn.textContent = '⌛'
  btn.disabled = true
  try {
    const res = await fetch('/api/recrop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ num, slot }),
    })
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '失敗')
    if (!state.images[num]) state.images[num] = {}
    state.images[num][slot] = data.image
    refreshSlot(num, slot)
  } catch (e) {
    btn.textContent = '⚠️'
    btn.title = String(e.message || e)
    btn.disabled = false
  }
}

// 検索ワードを指定して取得 (未取得スロットの救済 / 任意の語で取り直し)
async function customSearch(num, slot, btn) {
  if (readOnly) return
  const w = state.words.find((x) => x.num === num)
  const def =
    state.candidates?.[`${num}:${slot}`]?.query || (w && w[slot]) || ''
  const q = window.prompt('検索ワードを指定', def)
  if (q == null) return // キャンセル
  const oldImg = state.images?.[num]?.[slot] || null
  btn.textContent = '⌛'
  btn.disabled = true
  try {
    const res = await fetch('/api/search-custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ num, slot, query: q }),
    })
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '失敗')
    if (!state.images[num]) state.images[num] = {}
    state.images[num][slot] = data.image
    if (oldImg && oldImg.url !== data.image.url) {
      showChooser(num, slot, oldImg, data.image)
    } else {
      refreshSlot(num, slot)
    }
  } catch (e) {
    btn.textContent = '⚠️'
    btn.title = String(e.message || e)
    btn.disabled = false
  }
}

// 「新しい方 / 今までの方」を選ぶ UI (そのスロットだけ差し替え)
function showChooser(num, slot, oldImg, newImg) {
  const el = document.querySelector(`.slot[data-key="${num}:${slot}"]`)
  if (!el) return
  const box = document.createElement('div')
  box.className = 'slot'
  box.dataset.key = `${num}:${slot}`
  const title = document.createElement('div')
  title.className = 'choose-title'
  title.textContent = 'どっちにする?'
  box.appendChild(title)
  const opt = (label, img, onPick) => {
    const o = document.createElement('div')
    o.className = 'choose-opt'
    const im = document.createElement('img')
    im.loading = 'lazy'
    im.decoding = 'async'
    im.src = img.url
    const b = document.createElement('button')
    b.className = 'act-btn'
    b.textContent = label
    b.onclick = onPick
    o.appendChild(im)
    o.appendChild(b)
    return o
  }
  // 今までの方を上、新しい方を下に
  box.appendChild(
    opt('↩ 今までの方', oldImg, async () => {
      await fetch('/api/set-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ num, slot, image: oldImg }),
      })
      state.images[num][slot] = oldImg
      refreshSlot(num, slot)
    })
  )
  // 新は既に採用済み → 確定するだけ
  box.appendChild(opt('✓ 新しい方', newImg, () => refreshSlot(num, slot)))
  el.replaceWith(box)
}

function slotEl(w, slot) {
  const num = w.num
  const word = w[slot]
  const img = state.images?.[num]?.[slot]
  const st = slotStatus(num, slot)

  const wrap = document.createElement('div')
  wrap.className = 'slot'
  wrap.dataset.key = `${num}:${slot}`

  const kept = Boolean(state.keep?.[`${num}:${slot}`])
  const unconfirmed = Boolean(img) && !kept

  const thumb = document.createElement('div')
  thumb.className = 'thumb' + (st === 'flagged' ? ' flagged' : '')
  if (kept) thumb.classList.add('kept')
  if (unconfirmed) thumb.classList.add('unconfirmed')
  if (img) {
    const i = document.createElement('img')
    i.loading = 'lazy'
    i.decoding = 'async'
    i.src = img.url
    thumb.appendChild(i)
  } else {
    thumb.textContent = st === 'error' ? '取得失敗' : '未取得'
  }
  thumb.title = readOnly ? '' : 'クリックで redo トグル'
  thumb.onclick = () => toggleRedo(num, slot)
  wrap.appendChild(thumb)

  // 画像の下: 語 + 状態ラベル (画像には被せない)
  const label = document.createElement('div')
  label.className = 'slot-label'
  const wspan = document.createElement('span')
  wspanText(wspan, slot, word)
  label.appendChild(wspan)
  if (img) {
    const stat = document.createElement('span')
    stat.className = 'slot-stat ' + (kept ? 'is-kept' : 'is-unconf')
    stat.textContent = kept ? '🔒確定' : '未確定'
    label.appendChild(stat)
  }
  wrap.appendChild(label)

  // 操作ボタン
  if (!readOnly) {
    const actions = document.createElement('div')
    actions.className = 'slot-actions'
    const mk = (cls, text, title, fn) => {
      const b = document.createElement('button')
      b.className = cls
      b.textContent = text
      if (title) b.title = title
      b.onclick = (e) => {
        e.stopPropagation()
        fn(b)
      }
      actions.appendChild(b)
    }
    if (img) {
      mk('act-btn primary', kept ? '🔒 解除' : '👍 確定', '', () =>
        toggleKeep(num, slot)
      )
      if (!kept) {
        mk('act-btn', '✂️上', '元画像を上寄せでクロップ', (b) =>
          recropTop(num, slot, b)
        )
        mk('act-btn', '🔄', '別の画像で取り直す (今のと2択)', (b) =>
          redoNow(num, slot, b)
        )
        mk('act-btn', '✏️', '検索ワードを指定して取得', (b) =>
          customSearch(num, slot, b)
        )
      }
    } else {
      // 未取得スロットでも操作できるように
      mk('act-btn primary', '🔍 取得', '自動で画像を探す', (b) =>
        redoNow(num, slot, b)
      )
      mk('act-btn', '✏️ 指定', '検索ワードを指定して取得', (b) =>
        customSearch(num, slot, b)
      )
    }
    wrap.appendChild(actions)
  }
  return wrap
}

function wspanText(span, slot, word) {
  span.className = 'word'
  span.textContent = `${slot}: ${word}`
}

// Triple toggle: ロック状態でスロットを表示するか
function slotVisible(num, slot) {
  if (lockView === 'all') return true
  const key = `${num}:${slot}`
  const kept = Boolean(state.keep?.[key])
  // unconf: 未確定のみ (ロック全部非表示) / draft: 未確定 + 今回ロック分
  if (lockView === 'draft') return !kept || sessionLocks.has(key)
  return !kept
}

function render() {
  const grid = document.getElementById('grid')
  grid.innerHTML = ''
  const cards = state.words.filter(cardMatchesFilter)
  for (const w of cards) {
    const slots = SLOTS.filter((slot) => w[slot] && slotVisible(w.num, slot))
    if (slots.length === 0) continue // 表示するスロットが無いカードは省く
    const card = document.createElement('div')
    card.className = 'card'
    const num = document.createElement('div')
    num.className = 'card-num'
    num.textContent = w.num
    card.appendChild(num)
    for (const slot of slots) card.appendChild(slotEl(w, slot))
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
  const unconfirmed = has - kept
  const note = readOnly ? ' <span class="readonly-note">(閲覧専用)</span>' : ''
  document.getElementById(
    'stats'
  ).innerHTML = `画像 ${has}/${total} ・ 🔒確定 ${kept} ・ 未確定 ${unconfirmed} ・ redo ${flagged}${note}`
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
// Triple toggle switch。② 下書き はクリック不可 (自動遷移専用)
function renderLockView() {
  const box = document.getElementById('lockview')
  if (!box) return
  box.innerHTML = ''
  const sw = document.createElement('div')
  sw.className = 'tri-switch'
  const draftLabel = sessionLocks.size
    ? `下書き(${sessionLocks.size})`
    : '下書き'
  const views = [
    ['all', '全部', true],
    ['draft', draftLabel, false],
    ['unconf', '未確定のみ', true],
  ]
  for (const [key, label, clickable] of views) {
    const seg = document.createElement('button')
    seg.className =
      'tri-seg' +
      (key === lockView ? ' active' : '') +
      (clickable ? '' : ' auto')
    seg.textContent = label
    if (clickable) {
      seg.onclick = () => {
        lockView = key
        sessionLocks.clear() // 全部/未確定のみ へ移ると下書きは確定 (非表示)
        renderLockView()
        render()
      }
    }
    sw.appendChild(seg)
  }
  box.appendChild(sw)
}

async function main() {
  state = await loadState()
  renderFilters()
  renderLockView()
  render()
}
main()
