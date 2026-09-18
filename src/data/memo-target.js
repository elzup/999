// 数字 / カード / hex を 1 つの「記憶対象 ← 語」モデルで扱うための層。
//
// これまで 3 領域は形も置き場所も別だった:
//   数字 000-999  NumberEntry  hito/mono/gainen + w1/w2 + wh1..3 / wm1..3
//   カード 52 枚  CardEntry    person / object / action (PAO)
//   hex 00-FF     FfRow        word / kana / read
// 共通の型が無いので「同じ語を別の対象にも割り当てていないか」を領域をまたいで
// 引けず、hex は曖昧な逆引きを出題から除外する (UNIQUE_READ_ROWS) ことで
// 多対多を避けていた。
//
// ここは読み取り側だけの薄い読み替え層である。TSV / シート / Firestore の
// 書き込み経路と固定スロットはそのまま。3 つの形を DictEntry の列に均して、
// 語 → 対象 の逆引きを多対多で持てるようにするのが役目。
//
// 依存を持たない素の ESM。node のスクリプト (src/) と vite のアプリ (app/) が
// 同じものを読む。

import { ALL_SLOT_KEYS, slotFields } from './slots.js'

/**
 * @typedef {{ kind: 'num' | 'card' | 'hex', key: string }} MemoTarget
 * @typedef {{
 *   target: MemoTarget,
 *   role: string,
 *   word: string,
 *   kana: string,
 *   label: string,
 *   name: string,
 *   imageUrl: string,
 * }} DictEntry
 */

export const KINDS = /** @type {const} */ (['num', 'card', 'hex'])

/** 語が置かれる面。kind ごとに意味が違うので共通語彙にはしない */
export const ROLES = {
  num: ALL_SLOT_KEYS,
  card: ['person', 'object', 'action'],
  hex: ['word'],
}

/** `num:573` / `card:S-A` / `hex:B3`。Map のキーと表示に使う */
export const targetId = (target) => `${target.kind}:${target.key}`

const text = (value) => String(value ?? '').trim()

/** 照合用に揃えた語。見た目が同じなら同じキーになるようにする */
export const normalizeLabel = (value) => text(value).normalize('NFC')

/**
 * 語からタグ・別名・括弧注記を落とした本体。
 * words.js#extractName と同じ規則 (あちらは TSV を読む依存を持つので複製する)。
 */
export function baseName(word) {
  const raw = text(word)
  if (!raw) return ''
  return raw
    .split('#')[0]
    .replace(/\s+-\w+$/, '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .trim()
}

function entry(target, role, { word, kana, imageUrl } = {}) {
  const w = text(word)
  const k = text(kana)
  // 表示・照合は漢字語を優先し、無ければかな。FfRow の readLabel と同じ規則
  const label = normalizeLabel(w || k)
  return {
    target,
    role,
    word: w,
    kana: k,
    label,
    name: baseName(label),
    imageUrl: text(imageUrl),
  }
}

/** 値が入っている面だけを返す (空スロットは辞書に載せない) */
const filled = (entries) => entries.filter((e) => e.label !== '')

/** NumberEntry → DictEntry[] */
export function entriesOfNumber(number) {
  const target = { kind: 'num', key: text(number?.num) }
  return filled(
    ROLES.num.map((role) => {
      const field = slotFields(role)
      return entry(target, role, {
        word: number?.[field.word],
        kana: number?.[field.kana],
        imageUrl: number?.[field.image],
      })
    })
  )
}

/** CardEntry → DictEntry[]。PAO の 3 面をそれぞれ 1 語として扱う */
export function entriesOfCard(card) {
  const target = {
    kind: 'card',
    key: `${text(card?.suit)}-${text(card?.rank)}`,
  }
  return filled(
    ROLES.card.map((role) => entry(target, role, { word: card?.[role] }))
  )
}

/** FfRow → DictEntry[] */
export function entriesOfHex(row) {
  const target = { kind: 'hex', key: text(row?.hex) }
  return filled([entry(target, 'word', { word: row?.word, kana: row?.kana })])
}

/**
 * 3 領域を 1 本の DictEntry 列にする。渡さなかった領域は単に含まれない。
 * @param {{ numbers?: unknown[], cards?: unknown[], hex?: unknown[] }} sources
 * @returns {DictEntry[]}
 */
export function toEntries({ numbers = [], cards = [], hex = [] } = {}) {
  return [
    ...numbers.flatMap(entriesOfNumber),
    ...cards.flatMap(entriesOfCard),
    ...hex.flatMap(entriesOfHex),
  ]
}

/**
 * 語 → その語が割り当てられている DictEntry 群。多対多の逆引き。
 * キーは `label` (見た目そのまま)。タグや括弧注記の違いまで束ねたいときは、
 * 各 DictEntry の `name` で引き直す。
 * @param {DictEntry[]} entries
 * @returns {Map<string, DictEntry[]>}
 */
export function buildWordIndex(entries) {
  const index = new Map()
  for (const item of entries) {
    if (!item.label) continue
    const bucket = index.get(item.label)
    if (bucket) bucket.push(item)
    else index.set(item.label, [item])
  }
  return index
}

/** 語 → 対象 (重複なし)。同じ対象の複数スロットに入っていても 1 件に畳む */
export function targetsOf(index, label) {
  const hits = index.get(normalizeLabel(label)) ?? []
  const seen = new Set()
  const targets = []
  for (const hit of hits) {
    const id = targetId(hit.target)
    if (seen.has(id)) continue
    seen.add(id)
    targets.push(hit.target)
  }
  return targets
}

/** その語が指す対象がちょうど 1 つか。逆引きを一意に出題できる条件 */
export const isUniqueLabel = (index, label) =>
  targetsOf(index, label).length === 1

/**
 * 1 つの語が複数の対象に割り当てられている箇所。
 * 領域をまたいで拾えるのがここの要点 (573 の本命語と hex の語が同じ、など)。
 * @returns {{ label: string, targets: MemoTarget[], entries: DictEntry[] }[]}
 */
export function collisions(index) {
  const found = []
  for (const [label, entries] of index) {
    const targets = targetsOf(index, label)
    if (targets.length > 1) found.push({ label, targets, entries })
  }
  return found.sort((a, b) => b.targets.length - a.targets.length)
}
