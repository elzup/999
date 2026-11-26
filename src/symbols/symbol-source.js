// symbols / words から numbers の文書の形を組み立てて読む (DB 作り直しの段 5: 読みの切り替え)。
// spec: .metarc/db-design-targets.md §5。db.js が NUMBERS_SOURCE=symbols のときに使う。
//
// 読む側 (アプリの配信・シート同期・console) は今まで通り numbers の文書の形を受け取る。
// 形の変換は migrate-symbols --verify で全件の往復が一致することを確かめた fromDbSymbol + toNumberDoc。
import { fromDbSymbol } from './db-shape.js'
import { toNumberDoc } from './model.js'
import { SYMBOLS, WORDS } from './mirror.js'

const NUMBER_PREFIX = 'n:'
// getAll に渡せる参照数には上限がある (bisync-store と同じ)
const READ_BATCH = 300

export const symbolIdOf = (num) => `${NUMBER_PREFIX}${num}`
const numOf = (id) => id.slice(NUMBER_PREFIX.length)
const isNumberSymbol = (snap) =>
  snap.exists && snap.id.startsWith(NUMBER_PREFIX)

const chunks = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size)
  )

/** 語の文書 → 端末の語 (id は鍵) */
const wordOf = (data) => ({
  id: data.key,
  category: data.category,
  text: data.text,
  source: data.source,
})

export function createSymbolReader(store) {
  const symbols = store.collection(SYMBOLS)
  const words = store.collection(WORDS)
  // 語は文書 ID (鍵のハッシュ) から中身が決まり、後から変わらない。なので一度読んだものは
  // transaction の外で読んだ写しを使い回してよい (番号の文書と違い、古くなることが無い)
  const cache = new Map()

  async function loadWords(ids) {
    const missing = [...new Set(ids)].filter((id) => !cache.has(id))
    for (const part of chunks(missing, READ_BATCH)) {
      const snaps = await store.getAll(...part.map((id) => words.doc(id)))
      for (const snap of snaps) {
        if (snap.exists) cache.set(snap.id, wordOf(snap.data()))
      }
    }
    const absent = missing.filter((id) => !cache.has(id))
    // 指す語が無いまま組み立てると語が黙って消える。読み手には壊れた文書を渡さない
    if (absent.length)
      throw new Error(`words にない語を指している: ${absent.join(',')}`)
  }

  function numberDocOf(snap) {
    const data = snap.data()
    const linked = (data.words ?? []).map((link) => cache.get(link.wordId))
    const wordsByKey = Object.fromEntries(linked.map((word) => [word.id, word]))
    const keyOf = (id) => cache.get(id)?.id ?? id
    return toNumberDoc(
      fromDbSymbol(snap.id, data, keyOf, wordsByKey),
      wordsByKey
    )
  }

  async function docsOf(snaps) {
    const live = snaps.filter(isNumberSymbol)
    await loadWords(
      live.flatMap((snap) => (snap.data().words ?? []).map((l) => l.wordId))
    )
    return Object.fromEntries(
      live.map((snap) => [numOf(snap.id), numberDocOf(snap)])
    )
  }

  return {
    ref: (num) => symbols.doc(symbolIdOf(num)),

    /** transaction の中で 1 件。番号の文書は tx で読む (競合検出のため)、語は写しでよい */
    async readInTransaction(tx, num) {
      const snap = await tx.get(symbols.doc(symbolIdOf(num)))
      return (await docsOf([snap]))[num]
    },

    async readNumbers(nums) {
      const out = {}
      for (const part of chunks(nums, READ_BATCH)) {
        const snaps = await store.getAll(
          ...part.map((num) => symbols.doc(symbolIdOf(num)))
        )
        Object.assign(out, await docsOf(snaps))
      }
      return out
    },

    /** iso が null なら全件。updatedAt は ISO 文字列なので文字列比較で順序が合う */
    async readChangedSince(iso) {
      // 番号の文書の updatedAt は symbol では extras に入る (db-shape の toDbSymbol)
      const query = iso ? symbols.where('extras.updatedAt', '>', iso) : symbols
      return docsOf((await query.get()).docs)
    },
  }
}
