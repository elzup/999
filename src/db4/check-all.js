// 旧 DB (numbers) と新しい形 (symbols / words) を全部見る検査 (DB 計画 P3-7・P5-4)。
// 毎晩の Function (functions/index.js の db4Check) と scripts/db4-build.ts が使う
import { checkIntegrity } from './integrity.js'
import { shapeErrors } from './schema.js'
import { encodeWords } from './tag-codec.js'
import { toNumberDoc } from './to-legacy.js'
import { sheetFormOfDoc } from '../firestore/sheet-bisync.js'

/** 旧と新の値が食い違う番号 (C7)。一覧の文字列で比べる (枠の中抜けはシート同期と同じく詰めて同じとみなす) */
export function driftedNums(numbers, symbols, words) {
  const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
  const symbolsById = new Map(symbols.map((s) => [s.id, s]))
  return numbers.flatMap((doc) => {
    const symbol = symbolsById.get(`num:${doc.num}`)
    if (!symbol) return [doc.num]
    // 語が欠けた記号は旧の形に戻せず投げる。その違反は C1 として別に数えるので、ここでは食い違いに数えて先へ進む
    // (投げたままだと毎晩の検査ごと落ち、何も報告されない)
    try {
      const back = toNumberDoc(symbol, wordsById)
      const form = sheetFormOfDoc(doc)
      return back.hito === form.hito && back.mono === form.mono ? [] : [doc.num]
    } catch {
      return [doc.num]
    }
  })
}

/** @returns {{ ok, counts, errors, drift }} errors と drift は先頭 50 件まで */
/** words は中で使う形 (source = タグのコード)。tags は DB のタグ */
export function checkAll({ numbers, symbols, words, tags = [] }) {
  const { errors, notices } = checkIntegrity({ symbols, words })
  // 形は DB に書く形 (sourceId) で見る
  const shape = shapeErrors({
    symbols,
    words: encodeWords(words, tags).docs,
    tags,
  })
  const drift = driftedNums(numbers, symbols, words)
  const LIMIT = 50
  return {
    ok: errors.length === 0 && shape.length === 0 && drift.length === 0,
    counts: {
      numbers: numbers.length,
      symbols: symbols.length,
      words: words.length,
      errors: errors.length,
      shape: shape.length,
      drift: drift.length,
      sameSpelling: notices.length,
    },
    errors: [
      ...errors.map((e) => `${e.rule} ${e.symbol ?? e.word} ${e.detail}`),
      ...shape,
    ].slice(0, LIMIT),
    drift: drift.slice(0, LIMIT),
  }
}
