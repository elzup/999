// 双方向同期が使う Firestore 側の口。db.js の connect() が返す db を包む。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// base と状態は sync コレクションの 2 文書に置く。base は 1 番号 300 byte 程度で
// 1000 件でも 1 MiB に収まり、1 回の同期で 1 read / 1 write で済む。

import { writeNumber } from './write.js'

const SYNC = 'sync'
const BASE_ID = 'sheetBase'
const STATE_ID = 'sheetState'
// getAll に渡せる参照数には上限がある。多めに読む初回でも詰まらないよう分ける
const READ_BATCH = 300

export function createBisyncStore(db) {
  const store = db.raw
  const numbers = store.collection('numbers')
  const sync = store.collection(SYNC)

  const dataOf = (snaps) =>
    Object.fromEntries(
      snaps.filter((s) => s.exists).map((s) => [s.id, s.data()])
    )

  return {
    async readBase() {
      const snap = await sync.doc(BASE_ID).get()
      return snap.exists ? snap.data() : null
    },

    // merge で番号単位に足す。即時反映の回と定期の回が同時に書いても互いを消さない
    async writeBase(entries) {
      await sync.doc(BASE_ID).set({ nums: entries }, { merge: true })
    },

    async readState() {
      const snap = await sync.doc(STATE_ID).get()
      return snap.exists ? snap.data() : null
    },

    async writeState(state) {
      await sync.doc(STATE_ID).set(state)
    },

    /** iso が null なら全件。updatedAt は ISO 文字列なので文字列比較で順序が合う */
    async readChangedSince(iso) {
      const query = iso ? numbers.where('updatedAt', '>', iso) : numbers
      return dataOf((await query.get()).docs)
    },

    async readNumbers(nums) {
      const out = {}
      for (let i = 0; i < nums.length; i += READ_BATCH) {
        const refs = nums.slice(i, i + READ_BATCH).map((n) => numbers.doc(n))
        Object.assign(out, dataOf(await store.getAll(...refs)))
      }
      return out
    },

    writeNumber: (write) => writeNumber(db, write),
  }
}
