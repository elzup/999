// 読む形の写し (snapshots)。アプリを開くたびに記号と語を全部 (約 3,500 回) 読まないため、
// 番号は 100 件ずつ 10 文書、カードは 1 文書に旧の形で持つ。保存のたびに同じ transaction で書き換え、
// 毎晩 (変更があった日だけ) 全件から作り直す (共有している語の属性を変えたときのずれを直す)
import { withDerived } from '../firestore/derived.js'
import { toCard, toNumberDoc } from './to-legacy.js'

export const SNAPSHOTS = 'snapshots'
export const CARDS_SNAPSHOT = 'cards'
export const NUMBER_SNAPSHOTS = Array.from({ length: 10 }, (_, i) => `num_${i}`)

/** 最後に DB を書いた時刻を置く文書 (毎晩のバックアップが «変更があったか» を 1 回の読みで見る) */
export const CHANGE_DOC = { col: 'meta', id: 'dbChange' }

export const snapshotIdOf = (symbolId) =>
  symbolId.startsWith('num:')
    ? `num_${symbolId.slice('num:'.length, 'num:'.length + 1)}`
    : symbolId.startsWith('card:')
    ? CARDS_SNAPSHOT
    : null

/** 記号 1 つ → 写しに入れる (キー, 旧の形)。番号とカードだけ */
export function snapshotEntryOf(symbol, wordsById) {
  if (symbol.kind === 'num') {
    const doc = withDerived(toNumberDoc(symbol, wordsById))
    return [doc.num, doc]
  }
  if (symbol.kind === 'card') {
    const card = toCard(symbol, wordsById)
    return [card.suit + card.rank, card]
  }
  return null
}

/** 全件から写しを作る。@returns { [snapshotId]: { docs: { key: 旧の形 } } } */
export function buildSnapshots({ symbols, words }) {
  const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
  const empty = Object.fromEntries(
    [...NUMBER_SNAPSHOTS, CARDS_SNAPSHOT].map((id) => [id, { docs: {} }])
  )
  return symbols.reduce((acc, symbol) => {
    const id = snapshotIdOf(symbol.id)
    const entry = id && snapshotEntryOf(symbol, wordsById)
    if (!entry) return acc
    return {
      ...acc,
      [id]: { docs: { ...acc[id].docs, [entry[0]]: entry[1] } },
    }
  }, empty)
}
