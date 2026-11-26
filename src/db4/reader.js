// 新しい形 (symbols / words) から番号の文書 (旧 DB の形) を組み立てて読む (DB 計画 P6)。
// db.js が NUMBERS_SOURCE=symbols のときに使う。読む側 (アプリの配信・シート同期) は今まで通り番号の文書を受け取る。
//
// 語は表記を直すと中身が変わる (ID は同じ) ので、呼び出しをまたいで写しを使い回さない。
// 正本はまだ旧 DB なので、保存の transaction の読み (競合検出) は db.js が numbers を読む (P7 で移す)
import { withDerived } from '../firestore/derived.js'
import { symbolIdOf } from './ids.js'
import { toNumberDoc } from './to-legacy.js'
import { SYMBOLS, WORDS } from './write-layer.js'

// getAll に渡せる参照数には上限がある (bisync-store と同じ)
const READ_BATCH = 300
const NUM_PREFIX = 'num:'

const chunks = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size)
  )

export function createDb4Reader(store) {
  const symbols = store.collection(SYMBOLS)
  const words = store.collection(WORDS)

  async function loadWords(ids) {
    const unique = [...new Set(ids)]
    const found = new Map()
    for (const part of chunks(unique, READ_BATCH)) {
      const snaps = await store.getAll(...part.map((id) => words.doc(id)))
      for (const snap of snaps) {
        if (snap.exists) found.set(snap.id, { id: snap.id, ...snap.data() })
      }
    }
    const absent = unique.filter((id) => !found.has(id))
    // 指す語が無いまま組み立てると語が黙って消える。読み手には壊れた文書を渡さない
    if (absent.length)
      throw new Error(`words にない語を指している: ${absent.join(',')}`)
    return Object.fromEntries(found)
  }

  async function docsOf(snaps) {
    const live = snaps
      .filter((snap) => snap.exists && snap.id.startsWith(NUM_PREFIX))
      .map((snap) => ({ id: snap.id, ...snap.data() }))
    const wordsById = await loadWords(live.flatMap((s) => s.wordIds ?? []))
    return Object.fromEntries(
      live.map((symbol) => {
        const doc = toNumberDoc(symbol, wordsById)
        return [doc.num, withDerived(doc)]
      })
    )
  }

  return {
    async readNumbers(nums) {
      const out = {}
      for (const part of chunks(nums, READ_BATCH)) {
        const snaps = await store.getAll(
          ...part.map((num) => symbols.doc(symbolIdOf.num(num)))
        )
        Object.assign(out, await docsOf(snaps))
      }
      return out
    },

    /** iso が null なら全件。updatedAt は ISO 文字列なので文字列比較で順序が合う */
    async readChangedSince(iso) {
      const query = iso
        ? symbols.where('updatedAt', '>', iso)
        : symbols.where('kind', '==', 'num')
      return docsOf((await query.get()).docs)
    },
  }
}
