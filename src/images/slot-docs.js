// 画像データ 4 ファイル (manifest / keep / redo / candidates) と、Firestore の
// imageSlots/{id}:{slot} 文書 (1 枠 1 文書) を相互に変換する。spec:image-store
//
// 正本は Firestore、手元の 4 ファイルはその cache (D-0084)。
// fromSlotDocs(toSlotDocs(files)) が元と一致することを投入の条件にする (REQ-IMG-003)。

export const IMAGE_SLOTS = 'imageSlots'

/** 差し替え前の画像を残す数。撮り直しを数回ぶん巻き戻せれば足りる */
export const HISTORY_LIMIT = 5

export const slotDocId = (id, slot) => `${id}:${slot}`

/** "043:w1#ｽﾀﾚ" → { id: '043', slot: 'w1#ｽﾀﾚ' }。id に ':' は入らない */
export function splitSlotKey(key) {
  const at = key.indexOf(':')
  if (at <= 0) throw new Error(`枠のキーが不正: ${key}`)
  return { id: key.slice(0, at), slot: key.slice(at + 1) }
}

function manifestKeys(manifest) {
  return Object.entries(manifest.images ?? {}).flatMap(([id, slots]) =>
    Object.keys(slots).map((slot) => slotDocId(id, slot))
  )
}

/**
 * 4 ファイルから枠ごとの文書を作る。入力は書き換えない。
 * @returns {Record<string, object>} 文書 id → 文書
 */
export function toSlotDocs({ manifest, keep, redo, candidates }) {
  const keys = new Set([
    ...manifestKeys(manifest),
    ...Object.keys(keep.keep ?? {}),
    ...Object.keys(redo.redo ?? {}),
    ...Object.keys(candidates.items ?? {}),
  ])
  return Object.fromEntries(
    [...keys].sort().map((key) => {
      const { id, slot } = splitSlotKey(key)
      const doc = {
        id,
        slot,
        image: manifest.images?.[id]?.[slot] ?? null,
        keep: Boolean(keep.keep?.[key]),
        redo: redo.redo?.[key] ?? null,
        candidate: candidates.items?.[key] ?? null,
        history: [],
      }
      return [key, doc]
    })
  )
}

/** 枠ごとの文書から 4 ファイルを作り直す (cache の生成にも使う) */
export function fromSlotDocs(docs) {
  const manifest = { version: 1, images: {} }
  const keep = { version: 1, keep: {} }
  const redo = { version: 1, redo: {} }
  const candidates = { version: 1, items: {} }
  for (const doc of Object.values(docs)) {
    const key = slotDocId(doc.id, doc.slot)
    if (doc.image)
      manifest.images[doc.id] = {
        ...manifest.images[doc.id],
        [doc.slot]: doc.image,
      }
    if (doc.keep) keep.keep[key] = true
    if (doc.redo) redo.redo[key] = doc.redo
    if (doc.candidate) candidates.items[key] = doc.candidate
  }
  return { manifest, keep, redo, candidates }
}

/** 件数の要約。投入前後の照合に使う */
export function countFiles({ manifest, keep, redo, candidates }) {
  return {
    images: manifestKeys(manifest).length,
    keep: Object.keys(keep.keep ?? {}).length,
    redo: Object.keys(redo.redo ?? {}).length,
    candidates: Object.keys(candidates.items ?? {}).length,
  }
}

/**
 * 採用画像を差し替えた文書を返す。前の画像は history の先頭に残す (REQ-IMG-001)。
 * 同じ hash への差し替えは履歴を増やさない。
 */
export function replaceImage(doc, image) {
  const prev = doc.image
  const isSame = prev && image && prev.hash === image.hash
  const history =
    prev && !isSame
      ? [prev, ...(doc.history ?? [])].slice(0, HISTORY_LIMIT)
      : (doc.history ?? [])
  return { ...doc, image, history }
}

/** まだ文書の無い枠 (初めて印を付ける枠) の中身 */
export const emptySlotDoc = (id, slot) => ({
  id,
  slot,
  image: null,
  keep: false,
  redo: null,
  candidate: null,
  history: [],
})

/**
 * 枠に «確定» / «撮り直し» の印を付けた (外した) 文書を返す。入力は書き換えない。
 * ロック中の枠に撮り直しの印は付けない (次の一括で上書きされるため)。
 * @returns {{doc: object} | {error: 'locked'}}
 */
export function applyMark(doc, { id, slot, op, on, reason, now }) {
  const base = doc ?? emptySlotDoc(id, slot)
  if (op === 'keep')
    return { doc: { ...base, keep: Boolean(on), updatedAt: now } }
  if (on && base.keep) return { error: 'locked' }
  const redo = on ? { flaggedAt: now, reason: reason || '' } : null
  return { doc: { ...base, redo, updatedAt: now } }
}

/**
 * 取り直した画像を採用した文書を返す。前の画像は history に残し、撮り直しの印は消す。
 * candidate を渡したときだけ候補の記録 (語・検索ワード) を差し替える。入力は書き換えない。
 * ロック中の枠は差し替えない (ロックは «この画像で確定» の意味なので)。
 * @returns {{doc: object} | {error: 'locked'}}
 */
export function applyImage(doc, { id, slot, image, candidate, now }) {
  const base = doc ?? emptySlotDoc(id, slot)
  if (base.keep) return { error: 'locked' }
  const next = replaceImage(base, image)
  return {
    doc: {
      ...next,
      redo: null,
      candidate: candidate === undefined ? base.candidate : candidate,
      updatedAt: now,
    },
  }
}

/**
 * ピッカーに出した候補を文書に残す。採用画像は変えない。
 * 選んだ画像を set-image で受けるとき、ここにある画像だけを採用できる (画面から来た中身は書かない)。
 * @returns {{doc: object} | {error: 'locked'}}
 */
export function applyChoices(doc, { id, slot, choices, candidate, now }) {
  const base = doc ?? emptySlotDoc(id, slot)
  if (base.keep) return { error: 'locked' }
  return {
    doc: {
      ...base,
      choices,
      candidate: candidate === undefined ? base.candidate : candidate,
      updatedAt: now,
    },
  }
}

/** この枠に一度載った画像 (今・history・ピッカーに出した候補) から hash で探す */
export function findSlotImage(doc, hash) {
  if (!hash) return null
  const pool = [doc?.image, ...(doc?.history ?? []), ...(doc?.choices ?? [])]
  return pool.find((img) => img && img.hash === hash) ?? null
}

/** 撮り直しで避ける画像 (今の画像・前に差し替えた画像・候補で弾いた URL) */
export function rejectedUrlsOf(doc) {
  const urls = [
    doc?.image?.sourceImageUrl,
    ...(doc?.history ?? []).map((h) => h.sourceImageUrl),
    ...(doc?.candidate?.rejectedUrls ?? []),
  ]
  return [...new Set(urls.filter(Boolean))]
}

/** 文書の集まりから、画面が使う images / keep / redo / candidates / choices を作る */
export function marksView(docs) {
  const { manifest, keep, redo, candidates } = fromSlotDocs(docs)
  return {
    images: manifest.images,
    keep: keep.keep,
    redo: redo.redo,
    // 画像を取ったときの語と検索ワード (語が変わった枠を見分ける)
    candidates: candidates.items,
    choices: pendingChoicesOf(docs),
  }
}

/**
 * ピッカーに出したまま選んでいない候補の数 (枠 → 数)。今の画像は数えない。
 * 候補タブの «候補あり» と、ピッカーを開いたときに前回の候補を出すのに使う
 */
export function pendingChoicesOf(docs) {
  const out = {}
  for (const doc of Object.values(docs)) {
    const current = doc.image?.hash
    const n = (doc.choices ?? []).filter((c) => c?.hash !== current).length
    if (n > 0) out[slotDocId(doc.id, doc.slot)] = n
  }
  return out
}
