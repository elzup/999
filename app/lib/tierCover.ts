// ティアカバー: 番号の読み (1 桁の core / sub / bad と 2 桁読み) を格子に並べ、
// 登録語がどのマスを通るかを経路にする。詳細パネルの小さな図 (D-0096 / D-0097)。
//
// 格子 (123 の例)       列 = 桁 0..2 と 余り
//   2桁  [ てぃ  ]          2桁読みは またぐ 2 桁の幅で 2 段の上に架ける (C-4)
//   2桁       [  つ  ]
//   core  い   に   さ
//   sub   ひ   ふ   み   ん → 余り (3 桁を超えて読んだかな) は右へ抜ける
//   bad                     bad は誰かが通るときだけ出す
import type { NumberEntry, RulesData } from '../data/schema'
import { slotCandidates } from './choice'
import { parseWord } from './wordTags'
import {
  normalizeSingleKana,
  readingTokens,
  toNum,
  type ReadingTables,
  type ReadingToken,
} from './reading'

export type CoverRow = 'd0' | 'd1' | 'core' | 'sub' | 'bad'
const SINGLE_TIERS = ['core', 'sub', 'bad'] as const
type SingleTier = typeof SINGLE_TIERS[number]

export const DIGIT_COUNT = 3

export type CoverCell = {
  row: CoverRow
  col: number
  /** 2 桁読みは 2 */
  span: number
  /** 表のかな (複数あれば / でつなぐ)。空なら読みが無いマス */
  kana: string
}

export type CoverNode = { row: CoverRow; col: number }

export type CoverWord = {
  slot: string
  word: string
  /** 人 (wh) / 物 (wm) */
  kind: 'h' | 'm'
  nodes: CoverNode[]
  /** 3 桁を超えて読んだかな (ひふみん の ん)。無ければ空 */
  rest: string
}

export type TierCover = {
  num: string
  rows: CoverRow[]
  cells: CoverCell[]
  words: CoverWord[]
}

const joinKana = (kanas: string[] | undefined) => (kanas ?? []).join('/')

function doubleKana(rules: RulesData, a: string, b: string) {
  const r = Number(a)
  const c = Number(b)
  return joinKana([
    ...(rules.doubleMatrix[r]?.[c] ?? []),
    ...(rules.longMatrix[r]?.[c] ?? []),
  ])
}

function gridCells(rules: RulesData, num: string): CoverCell[] {
  const digits = [...num]
  const singles = digits.flatMap((digit, col) =>
    SINGLE_TIERS.map((tier) => ({
      row: tier,
      col,
      span: 1,
      kana: joinKana(rules.singleByDigit[digit]?.[tier]),
    }))
  )
  const doubles = [0, 1].map((col) => ({
    row: `d${col}` as CoverRow,
    col,
    span: 2,
    kana: doubleKana(rules, digits[col], digits[col + 1]),
  }))
  return [...doubles, ...singles]
}

/** 1 桁読みのかなが core / sub / bad のどれか。表に無い (っ など) は core とみなす */
function tierOf(rules: RulesData, kana: string, digit: string): SingleTier {
  const ch = normalizeSingleKana(kana)
  const bucket = rules.singleByDigit[digit]
  return SINGLE_TIERS.find((tier) => bucket?.[tier]?.includes(ch)) ?? 'core'
}

/**
 * 読みの区切りを格子の上に置く。3 桁に満たない読み (れい = 01) は先頭の 0 を省いたものとして
 * 右に寄せ、3 桁を超えた分 (と 3 桁目をまたぐ 2 桁読み) は余りにする
 */
export function placeTokens(
  rules: RulesData,
  tokens: ReadingToken[]
): { nodes: CoverNode[]; rest: string } {
  const total = tokens.reduce((n, tk) => n + tk.digits.length, 0)
  let pos = Math.max(0, DIGIT_COUNT - total)
  const nodes: CoverNode[] = []
  let rest = ''
  for (const tk of tokens) {
    const len = tk.digits.length
    const fits = len > 0 && pos + len <= DIGIT_COUNT
    if (fits && len === 1)
      nodes.push({ row: tierOf(rules, tk.kana, tk.digits), col: pos })
    else if (fits) nodes.push({ row: `d${pos}` as CoverRow, col: pos })
    // 読まないかなは 3 桁の中では経路に出さず、3 桁を超えたあとなら余りに含める
    else if (len > 0 || pos >= DIGIT_COUNT) rest += tk.kana
    pos += len
  }
  return { nodes, rest }
}

/** 語の経路に使う読み。語そのもの (タグを除く) がかなで番号どおりに読めればそれ、無ければヨミ */
function wordTokens(
  t: ReadingTables,
  num: string,
  texts: string[]
): ReadingToken[] | null {
  for (const text of texts) {
    if (!text) continue
    const tokens = readingTokens(t, text)
    if (!tokens) continue
    const digits = tokens.map((tk) => tk.digits).join('')
    if (toNum(digits) === num) return tokens
  }
  return null
}

export function buildTierCover(
  t: ReadingTables,
  entry: NumberEntry
): TierCover {
  const { rules } = t
  const words = slotCandidates(entry).flatMap((c): CoverWord[] => {
    const base = parseWord(c.word).base
    const tokens = wordTokens(t, entry.num, [base, c.kana])
    if (!tokens) return []
    const { nodes, rest } = placeTokens(rules, tokens)
    if (nodes.length === 0) return []
    const kind = c.slot.startsWith('wm') ? 'm' : 'h'
    return [{ slot: c.slot, word: base, kind, nodes, rest }]
  })
  const usesBad = words.some((w) => w.nodes.some((n) => n.row === 'bad'))
  const rows: CoverRow[] = [
    'd0',
    'd1',
    'core',
    'sub',
    ...(usesBad ? ['bad' as const] : []),
  ]
  const cells = gridCells(rules, entry.num).filter((c) => rows.includes(c.row))
  return { num: entry.num, rows, cells, words }
}
