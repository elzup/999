// 語の並べ替え・削除・別の番号への移動に、画像 (imageSlots) を付いて回らせる。
//
// imageSlots は «対象 id : 枠の位置» (043:w1) で持っていて、語では持っていない。
// 番号の slots だけを書き換えると、語が詰め直された枠に前の語の画像が残る
// (ジェシーを別の番号へ移すと、詰めて wh1 に来たエクシアにジェシーの画像が付く)。
// slots の書き込みが通った後に、書く前と後の slots を突き合わせて画像の文書を同じように動かす。
//
// 語は «語 + かな» で突き合わせる (代表・評価が語を指すのと同じ値)。
// タグ違いで分けた枠 (w1#ｽﾀﾚ) は元の枠ごと動かす。

import { CANONICAL_SLOT } from './targets.js'

/** アプリの枠名 (wh1) → 画像の枠名 (w1) */
export const IMAGE_SLOT_OF = Object.fromEntries(
  Object.entries(CANONICAL_SLOT).map(([image, app]) => [app, image])
)

const valueKey = (slot) =>
  `${String(slot?.word ?? '').normalize('NFC')}\u0001${String(slot?.kana ?? '').normalize('NFC')}`

/**
 * 画像の枠をどう動かすか。
 * @param {string} id 番号
 * @param {Record<string, {word, kana}>} before 書く前の slots
 * @param {Record<string, {word, kana}>} after 書いた後の slots
 * @param {{slot: string, from: {num: string, slot: string}}[]} carry 別の番号から移ってきた語 (移動先の枠 → 移動元)
 * @returns {{to: string, from: {id: string, slot: string} | null}[]}
 *   to は画像の枠名。from が null なら空にする。動かない枠は含めない
 */
export function planSlotMoves(id, before = {}, after = {}, carry = []) {
  const fromOf = new Map()
  for (const [slot, value] of Object.entries(before)) {
    if (IMAGE_SLOT_OF[slot]) fromOf.set(valueKey(value), slot)
  }
  const carried = new Map(carry.map((c) => [c.slot, c.from]))

  const plan = []
  for (const slot of Object.keys(IMAGE_SLOT_OF)) {
    const value = after[slot]
    let from = null
    if (value) {
      const carriedFrom = carried.get(slot)
      const was = fromOf.get(valueKey(value))
      if (carriedFrom && IMAGE_SLOT_OF[carriedFrom.slot]) {
        from = { id: carriedFrom.num, slot: IMAGE_SLOT_OF[carriedFrom.slot] }
      } else if (was) {
        from = { id, slot: IMAGE_SLOT_OF[was] }
      }
    }
    const to = IMAGE_SLOT_OF[slot]
    // 同じ語が同じ枠に居るなら動かさない
    if (from && from.id === id && from.slot === to) continue
    // もともと語が無く、今も無い枠は触らない
    if (!from && !before[slot] && !value) continue
    plan.push({ to, from })
  }
  return plan
}

const baseOf = (slot) => slot.split('#')[0]
const tagOf = (slot) => {
  const at = slot.indexOf('#')
  return at < 0 ? '' : slot.slice(at)
}

/** 文書の中身 (画像・印・候補・履歴) だけを、別の枠の文書として書き直す */
function moved(doc, id, slot, now) {
  return {
    ...(doc ?? {}),
    id,
    slot,
    image: doc?.image ?? null,
    keep: Boolean(doc?.keep),
    redo: doc?.redo ?? null,
    candidate: doc?.candidate ?? null,
    history: doc?.history ?? [],
    updatedAt: now,
  }
}

/**
 * planSlotMoves の計画を、今の imageSlots の文書に当てた書き込み一覧にする。
 * 読みを先に全部済ませてから書くので、入れ替え (w1 ⇄ w1_2) でも片方を潰さない。
 * @param {Record<string, object>} docs imageSlots の全文書 (文書 id → 文書)
 * @returns {{id: string, slot: string, doc: object}[]}
 */
export function slotMoveWrites(id, plan, docs, now) {
  const writes = []
  for (const { to, from } of plan) {
    // 元の枠とタグ違いの枠 (w1, w1#ｽﾀﾚ ...)
    const sources = from
      ? Object.values(docs).filter(
          (doc) => doc.id === from.id && baseOf(doc.slot) === from.slot
        )
      : []
    const present = Object.values(docs).filter(
      (doc) => doc.id === id && baseOf(doc.slot) === to
    )
    const tags = new Set([
      ...sources.map((doc) => tagOf(doc.slot)),
      ...present.map((doc) => tagOf(doc.slot)),
    ])
    for (const tag of tags) {
      const source = sources.find((doc) => tagOf(doc.slot) === tag) ?? null
      const slot = to + tag
      const current = present.find((doc) => tagOf(doc.slot) === tag)
      // 元が無く、今も空の文書なら書かない
      if (!source && (!current || isEmpty(current))) continue
      writes.push({ id, slot, doc: moved(source, id, slot, now) })
    }
  }
  return writes
}

function isEmpty(doc) {
  return (
    !doc.image &&
    !doc.keep &&
    !doc.redo &&
    !doc.candidate &&
    !(doc.history ?? []).length
  )
}
