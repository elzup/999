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

export function createSlotStore({ col, runTransaction }) {
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

  return {
    /** 全枠の文書 (cache を新しくしてから返す) */
    listSlots: ({ now }) => refresh(now),

    /**
     * 1 枠に印を付ける。読んでから書くまでを transaction にして、
     * 別の面 (Mac の同期) と同時に書いても片方を潰さない
     * @returns {Promise<{doc: object} | {error: 'locked'}>}
     */
    async setMark(mark) {
      const ref = col.doc(slotDocId(mark.id, mark.slot))
      const result = await runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const applied = applyMark(snap.exists ? snap.data() : null, mark)
        if (applied.doc) tx.set(ref, applied.doc)
        return applied
      })
      if (result.doc && docs)
        docs = { ...docs, [slotDocId(mark.id, mark.slot)]: result.doc }
      return result
    },
  }
}
