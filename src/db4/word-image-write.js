// 画像を確定したとき (imageSlots の 1 枠を書くとき)、同じ transaction で語の画像も書き換える (DB 計画 P8)。
// slot-store.js の update が呼ぶ。transaction は読みを先に済ませる決まりなので 2 段に分ける
import { linkImagesFromSlots } from './word-image.js'
import { SYMBOLS, WORDS } from './write-layer.js'

/** 読み: 番号の記号とその語 */
export async function prepareWordImage(store, tx, id, slot) {
  const snap = await tx.get(store.collection(SYMBOLS).doc(`num:${id}`))
  if (!snap.exists) return null
  const symbol = { id: snap.id, ...snap.data() }
  const ids = [...new Set(symbol.wordIds ?? [])]
  const wordSnaps = ids.length
    ? await tx.getAll(
        ...ids.map((wordId) => store.collection(WORDS).doc(wordId))
      )
    : []
  const words = wordSnaps
    .filter((w) => w.exists)
    .map((w) => ({ id: w.id, ...w.data() }))
  return { symbol, words, key: `${id}:${slot}` }
}

/** 書き: 枠に当たる語の画像を、今確定した画像にする (最後に確定したものが語の画像) */
export function commitWordImage(store, tx, plan, url) {
  if (!plan || !url) return null
  const [hit] = linkImagesFromSlots(
    [{ id: plan.key, image: { url } }],
    [plan.symbol],
    plan.words
  )
  if (!hit) return null
  tx.set(
    store.collection(WORDS).doc(hit.wordId),
    { imageUrl: url },
    { merge: true }
  )
  return hit.wordId
}
