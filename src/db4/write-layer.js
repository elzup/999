// 番号を保存する transaction の中で、新しい形 (symbols / words) も書く口 (計画 P3-2・P3-3)。
// 旧 DB (numbers) の書き込みと同じ transaction なので、片方だけ進むことは無い。
//
// Firestore の transaction は «読みを全部済ませてから書く» 決まりがあるので 2 段に分ける:
//   prepare (numbers を書く前): 今の記号・その語・その語を指す他の記号を読む
//   commit  (numbers を書いた後): syncNumber で作り直し、形と整合を確かめてから書く
// 違反があれば投げる。呼ぶ側の transaction ごと止まり、numbers にも書かない (P3-4: 書かずに止める)
//
// io は Admin SDK と REST の違いを隠す最小の口 (文書は { id, ...中身 } の形で返す):
//   getDocs(col, ids) → [doc|undefined]  / findSymbolsUsing(wordIds) → [symbol]
//   set(col, id, data) / remove(col, id)

import { symbolIdOf } from './ids.js'
import { checkIntegrity } from './integrity.js'
import { shapeErrors } from './schema.js'
import { syncNumber } from './sync-number.js'

export const SYMBOLS = 'symbols'
export const WORDS = 'words'

/** 新しい形にも書くか。P5 (本番に新しい形を作る) までは既定で書かない */
export const isDb4WriteOn = () => process.env.DB4_WRITE === 'on'

export class Db4WriteError extends Error {
  constructor(problems) {
    super(`新しい形に書けない: ${problems.slice(0, 5).join(' / ')}`)
    this.problems = problems
  }
}

// Firestore は undefined を受け付けない
const clean = (value) => JSON.parse(JSON.stringify(value))
const withoutId = ({ id: _id, ...rest }) => rest

export const prepareNumberWrite = (io, num) =>
  prepareSymbolWrite(io, symbolIdOf.num(num))

/** 記号 1 つの今の値 (番号・カード共通) */
export async function prepareSymbolWrite(io, symbolId) {
  const [prevSymbol] = await io.getDocs(SYMBOLS, [symbolId])
  const prevIds = prevSymbol?.wordIds ?? []
  const prevWords = (await io.getDocs(WORDS, prevIds)).filter(Boolean)
  const others = prevIds.length
    ? (await io.findSymbolsUsing(prevIds)).filter((s) => s.id !== symbolId)
    : []
  const sharedIds = new Set(others.flatMap((s) => s.wordIds ?? []))
  return { symbolId, prevSymbol: prevSymbol ?? null, prevWords, sharedIds }
}

/** @returns {{ symbol, upsertWords, deleteWordIds }} 書いた中身 */
/** カードなど番号以外: legacy は fromLegacy の入力 ({ cards: [card] }) */
export const commitSymbolWrite = (io, plan, legacy) =>
  commitNumberWrite(io, plan, undefined, legacy)

export function commitNumberWrite(io, plan, nextDoc, legacy) {
  const result = syncNumber({
    prevSymbol: plan.prevSymbol,
    prevWords: plan.prevWords,
    sharedIds: plan.sharedIds,
    nextDoc,
    legacy,
  })
  const upserted = new Map(result.upsertWords.map((w) => [w.id, w]))
  const linkedWords = result.symbol.wordIds.map(
    (id) => upserted.get(id) ?? plan.prevWords.find((w) => w.id === id)
  )
  const shape = shapeErrors({
    symbols: [result.symbol],
    words: result.upsertWords,
  })
  // 記号 1 つと、その語だけで見る (C2 = 他の記号の語は見えないので数えない)
  const { errors } = checkIntegrity({
    symbols: [result.symbol],
    words: linkedWords.filter(Boolean),
  })
  const problems = [...shape, ...errors.map((e) => `${e.rule} ${e.detail}`)]
  if (problems.length) throw new Db4WriteError(problems)
  io.set(SYMBOLS, plan.symbolId, clean(withoutId(result.symbol)))
  for (const word of result.upsertWords)
    io.set(WORDS, word.id, clean(withoutId(word)))
  for (const id of result.deleteWordIds) io.remove(WORDS, id)
  return result
}
