// imageSlots を読み書きする口 (web 版 console の Function 用。spec:image-store 段階 4)。
// Function のインスタンスが生きている間は全件をメモリに持ち、updatedAt が新しい文書だけ読み足す。
// 画面は書くたびに確定・撮り直しの一覧を丸ごと受け取るので、毎回全件を読むと 1 操作で約 2200 回の読み取りになる。
//
// col は Firestore の CollectionReference、runTransaction は Firestore#runTransaction。
// どちらも引数で受け取る (Firestore 無しでテストするため)。

import { applyMark, slotDocId } from './slot-docs.js'

/** 端末やインスタンスの時計のずれを吸収する重なり。読み直しは無害 */
const PULL_OVERLAP_MS = 5 * 60 * 1000

const toMap = (snap) =>
  Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))

/**
 * @param wordImage 省略可。{ prepare(tx, id, slot), commit(tx, plan, url) } を渡すと、画像を確定したとき語の画像も書く
 */
export function createSlotStore({ col, runTransaction, wordImage }) {
  let docs = null
  let pulledAt = null

  async function refresh(now) {
    if (!docs) {
      docs = toMap(await col.get())
    } else {
      const from = new Date(
        Date.parse(pulledAt) - PULL_OVERLAP_MS
      ).toISOString()
      docs = {
        ...docs,
        ...toMap(await col.where('updatedAt', '>', from).get()),
      }
    }
    pulledAt = now
    return docs
  }

  async function update(id, slot, fn) {
    const key = slotDocId(id, slot)
    const ref = col.doc(key)
    const result = await runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      // 語の画像 (DB 計画 P8) を同じ transaction で書くための読み。読みは書く前に済ませる決まり
      const wordPlan = await wordImage?.prepare(tx, id, slot)
      const before = snap.exists ? snap.data() : null
      const applied = fn(before)
      if (applied.doc) tx.set(ref, applied.doc)
      const url = applied.doc?.image?.url
      if (url && url !== before?.image?.url)
        wordImage?.commit(tx, wordPlan, url)
      return applied
    })
    if (result.doc && docs) docs = { ...docs, [key]: result.doc }
    return result
  }

  return {
    /** 全枠の文書 (cache を新しくしてから返す) */
    listSlots: ({ now }) => refresh(now),

    /**
     * 1 枠の文書を fn で書き換える。読んでから書くまでを transaction にして、
     * 別の面 (Mac の同期) と同時に書いても片方を潰さない
     * @param {(doc: object|null) => ({doc: object} | {error: string})} fn
     * @returns {Promise<{doc: object} | {error: string}>}
     */
    update,

    /** 1 枠に印を付ける */
    setMark: (mark) =>
      update(mark.id, mark.slot, (doc) => applyMark(doc, mark)),
  }
}
