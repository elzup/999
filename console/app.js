// 画像コンソール gallery。/api/state があればサーバ運用(redo 書込可)、
// 無ければ ./state.json を読む静的(閲覧専用)モードにフォールバックする。
// 本番 hosting の /console/ で開いたときは web 版 (D-0073): 認証付きの /api/console/* を読み、
// 付けられるのはロックと撮り直しの印だけ (取り直しそのものは Mac が起きたときに流す)。

const IS_WEB = location.pathname.startsWith('/console/')
const API = IS_WEB ? '/api/console' : '/api'
// 999 アプリがログイン時に保存する通行証 (app/lib/editorAuth.ts の EDIT_TOKEN_KEY)
const TOKEN_KEY = 'editToken999'

function authHeaders() {
  if (!IS_WEB) return {}
  let token = ''
  try {
    token = localStorage.getItem(TOKEN_KEY) || ''
  } catch (e) {
    // 保存領域が使えない (プライベートモード等)。未ログインと同じ扱いで 401 になる
    console.error('token', e)
  }
  return token ? { authorization: `Bearer ${token}` } : {}
}

let state = null
let readOnly = false
let filter = 'all'
// タグ (#res など) での絞り込み。空なら絞らない。状態のフィルタと掛け合わせて枠ごとに効かせる
let tagFilter = ''
// 語に埋め込まれたタグ。app/lib/tags.ts の TAG_RE と同じ (区切りは空白・#・カンマ)
const TAG_RE = /#([^\s#,]+)/g
const tagsOfWord = (word) =>
  [...String(word || '').matchAll(TAG_RE)].map((m) => m[1])
// この画面で操作した枠。確定・取得した瞬間にフィルタから外れて消えると、
// 押し間違いに気付けないので、対象か状態を切り替えるまでは出したままにする
const touched = new Set()
// タグの縦一覧 (アプリのグループタブと同じ形) を出しているか。選ぶとそのタグの画像だけに絞る
let isTagListOpen = false
// 枠が 人 (h) か 物 (m) か。アプリの詳細パネルの語の行と同じ色丸で示す。カードの A (動作) はどちらでもない
const SLOT_SIDE = {
  w1: 'h',
  w1_2: 'h',
  wh3: 'h',
  w2: 'm',
  w2_2: 'm',
  wm3: 'm',
  P: 'h',
  O: 'm',
}
const SIDE_LABEL = { h: '人', m: '物' }
const tagNameOf = (tag) => state.tagNames?.[tag] || tag

// 表示中の対象の種類 (番号 / 日付 / カード)。枠の並びは種類ごとにサーバが返す
// (src/images/targets.js の IMAGE_KINDS)。番号・日付は 人 1〜3 → 物 1〜3 の 6 枠
let kind = 'num'
const slotsOf = (k) => state.kinds[k].slots
// 対象ごとの枠。タグ違いの語は «旧スロット#タグ» の枠に分けてサーバが返す (D-0041)。
// 古い state.json (静的モード) には無いので種類の枠に戻す
const slotsFor = (t) => t.slots || slotsOf(t.kind)
const baseSlot = (slot) => slot.split('#')[0]
const kindTargets = () => state.targets.filter((t) => t.kind === kind)

const SUIT_MARK = { S: '♠', H: '♥', C: '♣', D: '♦' }
const targetLabel = (t) =>
  t.kind === 'card' ? t.id.slice(0, -1) + SUIT_MARK[t.id.at(-1)] : t.id
// [キー, 表示名, アイコン]
const FILTERS = [
  ['all', 'すべて', null],
  ['unconfirmed', '未確定', 'circle'],
  ['kept', '確定', 'lock'],
  ['missing', '未取得', 'imageOff'],
  ['changed', '語変更', 'alert'],
  ['flagged', 'redo', 'flag'],
]

async function loadWebState() {
  const res = await fetch(`${API}/state`, { headers: authHeaders() })
  if (res.status === 401)
    throw new Error('999 アプリでログインしてから開き直してください')
  if (!res.ok) throw new Error(`state を読めなかった (HTTP ${res.status})`)
  readOnly = false
  return await res.json()
}

async function loadState() {
  if (IS_WEB) return loadWebState()
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

function slotStatus(id, slot) {
  const key = `${id}:${slot}`
  const hasImg = Boolean(state.images?.[id]?.[slot])
  const flagged = Boolean(state.redo?.[key])
  const cand = state.candidates?.[key]
  if (flagged) return 'flagged'
  if (hasImg) return 'has'
  if (cand?.status === 'error') return 'error'
  return 'missing'
}

// フィルタは枠ごとに効かせる。対象 (カード等) 単位にすると、未確定で絞っても
// 同じ対象の確定済みの枠まで並んでしまう
function slotMatches(t, slot, f = filter) {
  if (!t[slot]) return false
  if (tagFilter && !tagsOfWord(t[slot]).includes(tagFilter)) return false
  const key = `${t.id}:${slot}`
  const st = slotStatus(t.id, slot)
  const kept = Boolean(state.keep?.[key])
  if (f === 'all') return true
  if (f === 'unconfirmed') return st === 'has' && !kept
  if (f === 'kept') return kept
  if (f === 'missing') return st === 'missing' || st === 'error'
  if (f === 'changed') return st === 'has' && wordChanged(t.id, slot, t[slot])
  if (f === 'flagged') return st === 'flagged'
  return true
}

const countMatches = (f) =>
  kindTargets().reduce(
    (n, t) => n + slotsFor(t).filter((slot) => slotMatches(t, slot, f)).length,
    0
  )

// 失敗を画面に出す。黙って state を空にすると «確定» が消え、ロックが外れたように見える
function showError(message) {
  let box = document.getElementById('console-error')
  if (!box) {
    box = document.createElement('div')
    box.id = 'console-error'
    box.setAttribute('role', 'alert')
    box.onclick = () => box.remove()
    document.body.appendChild(box)
  }
  box.textContent = message
}

/** POST して JSON を返す。HTTP エラーはサーバの error 文で投げる */
async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(data.error || `HTTP ${res.status} (サーバを再起動?)`)
  return data
}

async function toggleRedo(id, slot) {
  if (readOnly) return
  const key = `${id}:${slot}`
  try {
    const data = await postJson(`${API}/redo`, {
      id,
      slot,
      on: !state.redo?.[key],
    })
    state.redo = data.redo
    refreshSlot(id, slot)
  } catch (e) {
    console.error('redo', key, e)
    showError(`${key} の印を変えられなかった: ${e.message}`)
  }
}

// 画像をロック/解除 (ロック中は一括処理で上書きされない)
async function toggleKeep(id, slot) {
  if (readOnly) return
  const key = `${id}:${slot}`
  try {
    const data = await postJson(`${API}/keep`, {
      id,
      slot,
      on: !state.keep?.[key],
    })
    state.keep = data.keep
    refreshSlot(id, slot)
  } catch (e) {
    console.error('keep', key, e)
    showError(`${key} のロックを変えられなかった: ${e.message}`)
  }
}

// 1スロットだけ DOM を作り直す (グリッドのフィルタは再適用しない)
function refreshSlot(id, slot) {
  touched.add(`${id}:${slot}`)
  renderFilters()
  renderStats()
  const old = document.querySelector(`.slot[data-key="${id}:${slot}"]`)
  if (!old) return
  const w = state.targets.find((x) => x.id === id)
  if (w) old.replaceWith(slotEl(w, slot))
}

// その場で再検索→再取得し、今の画像と2択で選ばせる
async function redoNow(id, slot, btn) {
  if (readOnly) return
  const oldImg = state.images?.[id]?.[slot] || null
  setIconLabel(btn, 'spinner')
  btn.disabled = true
  try {
    const res = await fetch('/api/redo-now', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, slot }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (サーバを再起動?)')
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '画像取得に失敗')
    if (!state.images[id]) state.images[id] = {}
    state.images[id][slot] = data.image // 新を一旦採用
    delete state.redo[`${id}:${slot}`]
    if (oldImg && oldImg.url !== data.image.url) {
      showChooser(id, slot, oldImg, data.image) // 今の画像と2択
    } else {
      refreshSlot(id, slot)
    }
  } catch (e) {
    setIconLabel(btn, 'alert')
    btn.title = String(e.message || e) // 失敗理由をツールチップに
    btn.disabled = false
  }
}

// #i 枠のアバターをいまの名前で作り直す (名前を直したのに名札が古いままの枠の救済)
async function remakeAvatar(id, slot, btn) {
  if (readOnly) return
  setIconLabel(btn, 'spinner', '作成中')
  btn.disabled = true
  try {
    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, slot }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (サーバを再起動?)')
    const data = await res.json()
    if (!data.ok || !data.image)
      throw new Error(data.error || 'アバター作成に失敗')
    if (!state.images[id]) state.images[id] = {}
    state.images[id][slot] = data.image
    state.keep = data.keep
    refreshSlot(id, slot)
  } catch (e) {
    setIconLabel(btn, 'alert', '失敗')
    btn.title = String(e.message || e)
    btn.disabled = false
  }
}

// 元画像から上寄せでクロップし直す (固定アクション)
async function recropTop(id, slot, btn) {
  if (readOnly) return
  setIconLabel(btn, 'spinner')
  btn.disabled = true
  try {
    const res = await fetch('/api/recrop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, slot }),
    })
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '失敗')
    if (!state.images[id]) state.images[id] = {}
    state.images[id][slot] = data.image
    refreshSlot(id, slot)
  } catch (e) {
    setIconLabel(btn, 'alert')
    btn.title = String(e.message || e)
    btn.disabled = false
  }
}

// #i タグ (プライベートな友人)。src/avatar-i-images.js と同じ判定にする。
// \b があるので #ipra のような別タグには誤爆しない。
const hasITag = (w) => typeof w === 'string' && /#i\b/.test(w)

// images:avatar-i が焼いた画像か (manifest の sourcePage が 'dicebear:<style>')
const isDicebear = (img) =>
  String(img?.sourcePage || '').startsWith('dicebear:')

// 語からタグ(#x)・ラベル(-a)・別名(,以降)・括弧注記を落とした本体。
// src/words.js の extractName と同じ規則 (クライアントからは import できない)。
function nameOf(w) {
  if (!w) return ''
  return w
    .split('#')[0]
    .replace(/\s*-\w+\s*$/, '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .trim()
}

// sync でシートの語が差し替わった枠。タグが付いただけ (嫌 -> 嫌#g) は無視し、
// 本体が別語になったもの (鶴 -> 振る) だけを「画像が合っていない」として拾う。
function wordChanged(id, slot, word) {
  const searched = searchedWord(id, slot, state.images?.[id]?.[slot])
  if (!searched || !word) return false
  return nameOf(searched) !== nameOf(word)
}

// 画像を取ったときの語。アバターは検索しないので candidates に残らず、名札にした名前
// (DiceBear URL の seed) と比べる。これが無いと #i の語を直しても «語変更» が消えなかった
function searchedWord(id, slot, img) {
  if (isDicebear(img)) {
    try {
      return new URL(img.sourceImageUrl).searchParams.get('seed') || ''
    } catch {
      return ''
    }
  }
  return state.candidates?.[`${id}:${slot}`]?.word || ''
}

// 手入力した検索ワードはタブを閉じるまで保持する。試行錯誤で何度も打ち直す枠が
// あるため、失敗しても直前の入力から再開できるようにする (サーバには保存しない)。
const CUSTOM_QUERY_KEY = 'consoleCustomQuery'

function readCustomQueries() {
  try {
    return JSON.parse(sessionStorage.getItem(CUSTOM_QUERY_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadCustomQuery(id, slot) {
  return readCustomQueries()[`${id}:${slot}`] || ''
}

function saveCustomQuery(id, slot, query) {
  const all = readCustomQueries()
  const key = `${id}:${slot}`
  const next = query.trim()
    ? { ...all, [key]: query.trim() }
    : Object.fromEntries(Object.entries(all).filter(([k]) => k !== key))
  try {
    sessionStorage.setItem(CUSTOM_QUERY_KEY, JSON.stringify(next))
  } catch {
    /* プライベートモード等で書けなくても機能は落とさない */
  }
}

// 検索ワードを指定して取得 (未取得スロットの救済 / 任意の語で取り直し)
async function customSearch(id, slot, btn) {
  if (readOnly) return
  const w = state.targets.find((x) => x.id === id)
  // 前回この枠に入れた検索ワード > 保存済みクエリ > 語そのもの の順で初期値にする
  const def =
    loadCustomQuery(id, slot) ||
    state.candidates?.[`${id}:${slot}`]?.query ||
    (w && w[slot]) ||
    ''
  const q = window.prompt('検索ワードを指定', def)
  if (q == null) return // キャンセル
  saveCustomQuery(id, slot, q)
  const oldImg = state.images?.[id]?.[slot] || null
  setIconLabel(btn, 'spinner')
  btn.disabled = true
  try {
    const res = await fetch('/api/search-custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, slot, query: q }),
    })
    const data = await res.json()
    if (!data.ok || !data.image) throw new Error(data.error || '失敗')
    if (!state.images[id]) state.images[id] = {}
    state.images[id][slot] = data.image
    if (oldImg && oldImg.url !== data.image.url) {
      showChooser(id, slot, oldImg, data.image)
    } else {
      refreshSlot(id, slot)
    }
  } catch (e) {
    setIconLabel(btn, 'alert')
    btn.title = String(e.message || e)
    btn.disabled = false
  }
}

// 「新しい方 / 今までの方」を選ぶ UI (そのスロットだけ差し替え)
function showChooser(id, slot, oldImg, newImg) {
  const el = document.querySelector(`.slot[data-key="${id}:${slot}"]`)
  if (!el) return
  const box = document.createElement('div')
  box.className = 'slot is-choosing'
  box.dataset.key = `${id}:${slot}`
  const w = state.targets.find((x) => x.id === id)
  if (w) box.appendChild(slotHead(w, slot))
  const title = document.createElement('div')
  title.className = 'choose-title'
  title.textContent = 'どちらにしますか'
  box.appendChild(title)
  const opt = (iconName, label, img, onPick) => {
    const o = document.createElement('div')
    o.className = 'choose-opt'
    const im = document.createElement('img')
    im.loading = 'lazy'
    im.decoding = 'async'
    im.src = img.url
    const b = document.createElement('button')
    b.className = 'act-btn'
    setIconLabel(b, iconName, label)
    b.onclick = onPick
    o.append(im, b)
    return o
  }
  // 今までの方を上、新しい方を下に
  box.appendChild(
    opt('undo', '今までの方', oldImg, async () => {
      try {
        await postJson('/api/set-image', { id, slot, image: oldImg })
        state.images[id][slot] = oldImg
        refreshSlot(id, slot)
      } catch (e) {
        console.error('set-image', id, slot, e)
        showError(`${id}:${slot} を今までの画像に戻せなかった: ${e.message}`)
      }
    })
  )
  // 新は既に採用済み → 確定するだけ
  box.appendChild(opt('check', '新しい方', newImg, () => refreshSlot(id, slot)))
  el.replaceWith(box)
}

/** 枠の見た目を決める状態をまとめて求める (表示とボタンで同じ判定を使う) */
function slotView(w, slot) {
  const id = w.id
  const word = w[slot]
  const img = state.images?.[id]?.[slot]
  const st = slotStatus(id, slot)
  // #i (プライベートな友人) は DiceBear アバターで固定。実写に差し替わると困るので
  // 検索系の操作は出さない。images:avatar-i が keep も立てている。
  const isAvatarI = hasITag(word)
  // タグだけ見て確定扱いにすると、後から #i を付けた枠 (実写のまま・keep 無し) が
  // 「確定」表示なのに未確定フィルタに出る。表示もフィルタと同じ keep を正にする。
  const kept = Boolean(state.keep?.[`${id}:${slot}`])
  const isAvatarPending = isAvatarI && !(kept && isDicebear(img))
  const changed = Boolean(img) && wordChanged(id, slot, word)
  return { id, slot, word, img, st, isAvatarI, kept, isAvatarPending, changed }
}

function slotEl(w, slot) {
  const v = slotView(w, slot)
  const wrap = document.createElement('div')
  wrap.className = 'slot'
  wrap.dataset.key = `${v.id}:${slot}`
  wrap.append(slotHead(w, slot), thumbEl(v, slot), wordRow(v.word), statRow(v))
  if (!readOnly) wrap.appendChild(actionsEl(v, slot))
  return wrap
}

function thumbEl(v, slot) {
  const thumb = document.createElement('div')
  thumb.className = 'thumb'
  if (v.st === 'flagged') thumb.classList.add('flagged')
  else if (v.changed || v.isAvatarPending) thumb.classList.add('changed')
  else if (v.kept) thumb.classList.add('kept')
  else if (v.img) thumb.classList.add('unconfirmed')
  if (v.img) {
    const i = document.createElement('img')
    i.loading = 'lazy'
    i.decoding = 'async'
    i.src = v.img.url
    i.alt = v.word
    // 概念 (#g) は実物の写真ではないので、アプリと同じく二重の枠で見分ける
    if (tagsOfWord(v.word).includes('g')) i.dataset.concept = ''
    thumb.appendChild(i)
  } else {
    const empty = document.createElement('div')
    empty.className = 'thumb-empty'
    setIconLabel(empty, 'imageOff', v.st === 'error' ? '取得失敗' : '未取得')
    thumb.appendChild(empty)
  }
  const side = SLOT_SIDE[baseSlot(slot)]
  if (side) {
    const badge = document.createElement('span')
    badge.className = `side-badge side-${side}`
    badge.textContent = SIDE_LABEL[side]
    thumb.appendChild(badge)
  }
  if (v.isAvatarI) {
    thumb.title = '#i はアバター固定 (検索した画像には差し替えない)'
  } else if (
    state.keep?.[`${v.id}:${slot}`] &&
    !state.redo?.[`${v.id}:${slot}`]
  ) {
    // ロック中の枠に印を付けると一括の取り直しで上書きされる (サーバも断る)
    thumb.title = 'ロック中 (印を付けるならロックを外してから)'
  } else if (!readOnly) {
    thumb.title = 'クリックで redo の印を付け外し'
    thumb.onclick = () => toggleRedo(v.id, slot)
  }
  return thumb
}

// カードの見出し: 番号を大きく、枠名 (w1 など) を添える
function slotHead(w, slot) {
  const head = document.createElement('div')
  head.className = 'slot-head'
  const num = document.createElement('span')
  num.className = 'slot-num'
  num.textContent = targetLabel(w)
  const key = document.createElement('span')
  key.className = 'slot-key'
  // 枠はシート・アプリと同じ名前 (wh1〜wm3) で出す。保存のキーは旧名 (w1 など) のまま
  const base = baseSlot(slot)
  key.textContent = (state.slotNames?.[base] || base) + slot.slice(base.length)
  head.append(num, key)
  return head
}

// 語は省略しない (読めないまま確定・解除すると危ない)。長い語は折り返す
// タグは略号ではなく表示名で出す (#ipra → アイドリープライド)。押すとそのタグで絞る
function wordRow(word) {
  const el = document.createElement('div')
  el.className = 'word'
  if (!word) {
    el.textContent = '(空)'
    return el
  }
  el.title = word
  const base = document.createElement('span')
  base.textContent = String(word).replace(TAG_RE, '').trim()
  el.appendChild(base)
  for (const tag of new Set(tagsOfWord(word))) {
    const b = document.createElement('button')
    b.className = 'word-tag'
    b.textContent = tagNameOf(tag)
    b.title = `#${tag} で絞る`
    b.onclick = () => setTagFilter(tag)
    el.appendChild(b)
  }
  return el
}

function chip(cls, iconName, text) {
  const el = document.createElement('span')
  el.className = `slot-stat ${cls}`
  setIconLabel(el, iconName, text)
  return el
}

// 2 行目 = 状態。高さを揃えるため、画像が無い枠でも行は必ず置く
function statRow(v) {
  const row = document.createElement('div')
  row.className = 'slot-stats'
  if (v.st === 'flagged') row.appendChild(chip('is-flagged', 'flag', 'redo'))
  if (!v.img) {
    row.appendChild(
      chip(
        v.st === 'error' ? 'is-changed' : 'is-none',
        'imageOff',
        v.st === 'error' ? '取得失敗' : '未取得'
      )
    )
  } else if (v.isAvatarI) {
    row.appendChild(
      v.isAvatarPending
        ? chip('is-changed', 'alert', 'アバター未作成')
        : chip('is-kept', 'user', 'アバター')
    )
  } else {
    row.appendChild(
      v.kept
        ? chip('is-kept', 'lock', '確定')
        : chip('is-unconf', 'circle', '未確定')
    )
  }
  // 画像は前の語で取ったもの。確定済みでも当ては外れているので目立たせる。
  // スマホでは title が見えないので、取ったときの語を本文に出す
  if (v.changed) {
    row.appendChild(chip('is-changed', 'alert', '語変更'))
    const was = document.createElement('div')
    was.className = 'slot-was'
    was.textContent = `取得時: ${searchedWord(v.id, v.slot, v.img)}`
    row.appendChild(was)
  }
  return row
}

// 操作は 1 行に収める (段数が枠ごとに変わると高さがガタつく)。
// 主ボタン (確定 / 解除 / 取得) + アイコンだけの補助ボタン
function actionsEl(v, slot) {
  const actions = document.createElement('div')
  actions.className = 'slot-actions'
  const mk = (cls, iconName, text, title, fn) => {
    const b = document.createElement('button')
    b.className = cls
    setIconLabel(b, iconName, text)
    if (title) b.title = title
    b.onclick = (e) => {
      e.stopPropagation()
      fn(b)
    }
    actions.appendChild(b)
  }
  const { id } = v
  if (IS_WEB) return webActionsEl(v, slot, actions, mk)
  if (v.isAvatarI) {
    // 名前が変わった (または実写のまま) 枠だけ作り直せる。他は押す物が無い
    if (v.isAvatarPending || v.changed) {
      mk(
        'act-btn primary',
        'user',
        'アバターを作る',
        'いまの名前でアバターを作り直して確定',
        (b) => remakeAvatar(id, slot, b)
      )
    } else {
      const note = document.createElement('div')
      note.className = 'act-note'
      note.textContent = 'アバター固定'
      actions.appendChild(note)
    }
    return actions
  }
  if (v.img) {
    mk(
      'act-btn primary' + (v.kept ? ' is-kept' : ''),
      v.kept ? 'unlock' : 'check',
      v.kept ? '解除' : '確定',
      '',
      () => toggleKeep(id, slot)
    )
    if (!v.kept) {
      mk('act-btn icon-only', 'cropTop', '', '元画像を上寄せでクロップ', (b) =>
        recropTop(id, slot, b)
      )
      mk(
        'act-btn icon-only',
        'refresh',
        '',
        '別の画像で取り直す (今のと 2 択)',
        (b) => redoNow(id, slot, b)
      )
      mk('act-btn icon-only', 'pencil', '', '検索ワードを指定して取得', (b) =>
        customSearch(id, slot, b)
      )
    }
  } else {
    mk('act-btn primary', 'search', '取得', '自動で画像を探す', (b) =>
      redoNow(id, slot, b)
    )
    mk('act-btn icon-only', 'pencil', '', '検索ワードを指定して取得', (b) =>
      customSearch(id, slot, b)
    )
  }
  return actions
}

// web 版の操作。取り直し・切り抜き・自由検索は Mac の中でしか動かないので出さず、
// 代わりに撮り直しの印を付ける (サムネイルを押すのと同じ)
function webActionsEl(v, slot, actions, mk) {
  const { id } = v
  if (v.isAvatarI) return actions
  if (v.img)
    mk(
      'act-btn primary' + (v.kept ? ' is-kept' : ''),
      v.kept ? 'unlock' : 'check',
      v.kept ? '解除' : '確定',
      '',
      () => toggleKeep(id, slot)
    )
  if (!v.kept) {
    const flagged = Boolean(state.redo?.[`${id}:${slot}`])
    mk(
      'act-btn wide' + (flagged ? ' is-flagged' : ''),
      'flag',
      flagged ? '印を外す' : v.img ? '撮り直す' : '取得する',
      'Mac が起きたときにまとめて取り直す',
      () => toggleRedo(id, slot)
    )
  }
  return actions
}

// 1 枠 = 1 カード。番号ごとにまとめると枠の数でカードの高さが揃わず余白が出る
function render() {
  const grid = document.getElementById('grid')
  grid.innerHTML = ''
  const list = document.getElementById('tag-list')
  grid.hidden = isTagListOpen
  list.hidden = !isTagListOpen
  document
    .getElementById('tag-list-toggle')
    .classList.toggle('active', isTagListOpen)
  if (isTagListOpen) {
    renderTagList(list)
    renderStats()
    return
  }
  for (const w of kindTargets()) {
    for (const slot of slotsFor(w)) {
      if (slotMatches(w, slot) || touched.has(`${w.id}:${slot}`))
        grid.appendChild(slotEl(w, slot))
    }
  }
  renderStats()
  requestAnimationFrame(rememberCellHeight)
}

// 画面外のカードは描画を省く (content-visibility)。その間の仮の高さを実物に合わせ、
// スクロールで描画されたときに位置が跳ねないようにする
function rememberCellHeight() {
  const first = document.querySelector('#grid .slot')
  if (!first) return
  document
    .getElementById('grid')
    .style.setProperty('--cell-h', `${first.offsetHeight}px`)
}

function renderStats() {
  let has = 0
  let total = 0
  let flagged = 0
  let kept = 0
  for (const w of kindTargets()) {
    for (const slot of slotsFor(w)) {
      if (!w[slot]) continue
      total++
      const st = slotStatus(w.id, slot)
      if (st === 'has') has++
      if (st === 'flagged') flagged++
      if (state.keep?.[`${w.id}:${slot}`]) kept++
    }
  }
  const unconfirmed = has - kept
  const note = readOnly ? ' <span class="readonly-note">(閲覧専用)</span>' : ''
  document.getElementById(
    'stats'
  ).innerHTML = `画像 ${has}/${total} ・ 確定 ${kept} ・ 未確定 ${unconfirmed} ・ redo ${flagged}${note}`
}

function renderKinds() {
  const box = document.getElementById('kinds')
  box.innerHTML = ''
  for (const [key, { label }] of Object.entries(state.kinds)) {
    const count = state.targets.filter((t) => t.kind === key).length
    const b = document.createElement('button')
    const text = document.createElement('span')
    text.textContent = label
    const num = document.createElement('span')
    num.className = 'count'
    num.textContent = count
    b.append(text, num)
    b.className = key === kind ? 'active' : ''
    b.onclick = () => {
      kind = key
      touched.clear()
      renderKinds()
      renderTagFilter()
      renderFilters()
      render()
    }
    box.appendChild(b)
  }
}

function renderFilters() {
  const box = document.getElementById('filters')
  box.innerHTML = ''
  for (const [key, label, iconName] of FILTERS) {
    const b = document.createElement('button')
    if (iconName) b.appendChild(icon(iconName))
    const text = document.createElement('span')
    text.textContent = label
    const count = document.createElement('span')
    count.className = 'count'
    count.textContent = countMatches(key)
    b.append(text, count)
    b.className = key === filter ? 'active' : ''
    b.onclick = () => {
      filter = key
      touched.clear()
      renderFilters()
      render()
    }
    box.appendChild(b)
  }
}
/** 表示中の種類の語に出てくるタグを、使われている枠の数の多い順に */
function tagCounts() {
  const counts = new Map()
  for (const t of kindTargets()) {
    for (const slot of slotsFor(t)) {
      for (const tag of new Set(tagsOfWord(t[slot]))) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
  }
  return [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')
  )
}

// タグは 150 種以上あるのでボタンを並べず、候補付きの入力欄 (datalist) で選ぶ
function renderTagFilter() {
  const list = document.getElementById('tag-options')
  list.innerHTML = ''
  for (const [tag, n] of tagCounts()) {
    const opt = document.createElement('option')
    opt.value = tag
    const name = state.tagNames?.[tag]
    // datalist はブラウザが value と label の両方で絞るので、表示名を label に入れておけば
    // «アトリエ» と打っても #res が候補に出る
    opt.label =
      name && name !== tag ? `#${tag} ${name} (${n})` : `#${tag} (${n})`
    list.appendChild(opt)
  }
  const input = document.getElementById('tag-filter')
  input.value = tagFilter
  document.getElementById('tag-clear').hidden = !tagFilter
}

// 表示名 (アトリエ) をそのまま打って確定したときも、そのタグ (res) で絞る。
// datalist が label で絞らないブラウザ (Safari) でも名前で選べるように
function tagFromInput(value) {
  const text = value.trim().replace(/^#+/, '')
  if (!text) return ''
  const fold = (t) => t.normalize('NFKC').toLowerCase()
  const known = tagCounts().map(([tag]) => tag)
  if (known.includes(text)) return text
  const byName = known.find(
    (tag) => fold(state.tagNames?.[tag] ?? '') === fold(text)
  )
  return byName ?? text
}

/** タグの縦一覧。作品名を主に、#id と枠の数を添える (id だけでは何の作品か分からない) */
function renderTagList(list) {
  list.innerHTML = ''
  for (const [tag, n] of tagCounts()) {
    const row = document.createElement('button')
    row.className = 'tag-row' + (tag === tagFilter ? ' active' : '')
    const name = document.createElement('span')
    name.className = 'tag-row-name'
    name.textContent = tagNameOf(tag)
    const id = document.createElement('span')
    id.className = 'tag-row-id'
    id.textContent = `#${tag}`
    const count = document.createElement('span')
    count.className = 'tag-row-count'
    count.textContent = n
    row.append(name, id, count)
    row.onclick = () => setTagFilter(tag)
    list.appendChild(row)
  }
}

function setTagFilter(value) {
  tagFilter = tagFromInput(value)
  isTagListOpen = false
  touched.clear()
  renderTagFilter()
  renderFilters()
  render()
}

// web 版はアプリの設定から同じ画面のまま来るので (D-0076)、ホーム画面のアプリでは
// ブラウザの戻るが無い。見出しの前にアプリへの戻り道を置く
function addBackToApp() {
  const link = document.createElement('a')
  link.href = '/'
  link.textContent = '← アプリへ戻る'
  Object.assign(link.style, {
    color: 'var(--text2)',
    fontSize: '13px',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  })
  document.querySelector('header')?.prepend(link)
}

async function main() {
  if (IS_WEB) addBackToApp()
  state = await loadState()
  document.getElementById('tag-filter').onchange = (e) =>
    setTagFilter(e.target.value)
  const clear = document.getElementById('tag-clear')
  setIconLabel(clear, 'x')
  clear.onclick = () => setTagFilter('')
  document.getElementById('tag-list-toggle').onclick = () => {
    isTagListOpen = !isTagListOpen
    render()
  }
  renderKinds()
  renderTagFilter()
  renderFilters()
  render()
}
// 未ログインや state が読めないときは、白い画面のままにせず理由を出す
main().catch((e) => {
  console.error('main', e)
  showError(e.message)
})
