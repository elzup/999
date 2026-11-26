// 語・番号の格 (悪い順と同じ判定: worstRank.ts) を画面に出すときの色と並び。
// 格はどの画面でもこの 1 か所の色で塗る (D-0171)。色は 20 段の連続した色相 (C-4)。
import type { NumberDoc } from './numberApi'
import {
  better,
  LEVEL,
  PATTERN_ORDER,
  worstRowOf,
  type GradedWord,
} from './worstRank'

const WORST = PATTERN_ORDER.length
/** 1 位の緑 (130°) から 20 位の赤 (≒0°) まで等間隔 */
const HUE_TOP = 130
const HUE_STEP = HUE_TOP / (WORST - 1)

export const gradeColor = (worst: number) =>
  `hsl(${Math.round(
    HUE_TOP - (Math.min(Math.max(worst, 1), WORST) - 1) * HUE_STEP
  )} 70% 55%)`

/** 悪い順と同じ並び。評価 -1 の語は数えない語なので一番後ろ */
export const byGrade = (a: GradedWord, b: GradedWord) =>
  Number(a.rating === -1) - Number(b.rating === -1) || better(a, b)

/** 番号 1 つの格。null = 語なし、'bad' = 評価 -1 の語しか無い */
export type NumberGrade = number | 'bad' | null

export function numberGrade(
  num: string,
  doc: NumberDoc | undefined
): NumberGrade {
  const row = worstRowOf(num, doc)
  if (row.level === LEVEL.none) return null
  if (row.level === LEVEL.onlyBad) return 'bad'
  return row.basis?.worst ?? null
}

/** 十の位ごとの番号の格を、良い順に (語なし → -1 だけ は最後) */
export function decadeGrades(
  docs: NumberDoc[],
  hundred: string
): NumberGrade[][] {
  const byNum = new Map(docs.map((doc) => [doc.num, doc]))
  const rank = (g: NumberGrade) =>
    g === null ? WORST + 2 : g === 'bad' ? WORST + 1 : g
  return Array.from({ length: 10 }, (_, decade) =>
    Array.from({ length: 10 }, (_, one) => {
      const num = `${hundred}${decade}${one}`
      return numberGrade(num, byNum.get(num))
    }).sort((a, b) => rank(a) - rank(b))
  )
}
