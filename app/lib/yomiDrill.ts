import type { RulesData, YomiUse } from '../data/schema'
import type { KeypadQuestion } from '../components/KeypadQuiz'

export type YomiKind = 'youon' | 'long'

/** かな2文字の読み1件。nums = その読みを割り当てている番号 */
export type YomiItem = {
  kana: string
  digits: string
  kind: YomiKind
  nums: string[]
}

export const YOMI_SCOPES = ['all', 'youon', 'long'] as const
export type YomiScope = typeof YOMI_SCOPES[number]

export const YOMI_SCOPE_LABEL: Record<YomiScope, string> = {
  all: '全部',
  youon: '拗音',
  long: '長音',
}

const isTwoChar = (kana: string) => [...kana].length === 2

function fromMatrix(
  matrix: string[][][],
  kind: YomiKind,
  yomiUse: YomiUse | undefined
): YomiItem[] {
  return matrix.flatMap((row, r) =>
    row.flatMap((kanas, c) =>
      kanas.filter(isTwoChar).map((kana) => ({
        kana,
        digits: `${r}${c}`,
        kind,
        nums: yomiUse?.[kana] ?? [],
      }))
    )
  )
}

/**
 * rules のマトリクスから「かな2文字の読み」だけを取り出す (数字昇順)。
 * 表そのものは rules 経由で配信済みなので、ドリル用に別データを持たない。
 */
export function buildYomiItems(
  rules: RulesData | undefined,
  yomiUse: YomiUse | undefined
): YomiItem[] {
  if (!rules) return []
  return [
    ...fromMatrix(rules.doubleMatrix, 'youon', yomiUse),
    ...fromMatrix(rules.longMatrix, 'long', yomiUse),
  ]
}

export function filterScope(items: YomiItem[], scope: YomiScope): YomiItem[] {
  if (scope === 'all') return items
  return items.filter((item) => item.kind === scope)
}

/** Fisher-Yates。元配列は壊さない。 */
export function shuffle<T>(
  list: readonly T[],
  rand: () => number = Math.random
): T[] {
  return list.reduce<T[]>((acc, item) => {
    const j = Math.floor(rand() * (acc.length + 1))
    return [...acc.slice(0, j), item, ...acc.slice(j)]
  }, [])
}

/** 出題数の選択肢。0 = 範囲の全部 */
export const YOMI_COUNT_OPTIONS = [10, 20, 0] as const

export const yomiCountLabel = (count: number) =>
  count === 0 ? '全部' : `${count}問`

/** 「割当 7 番号 · 128 284 …」。未使用なら 0 と明示する (それも覚える情報)。 */
export function usageNote(item: YomiItem): string {
  if (item.nums.length === 0) return '割当 0 — この読みを使う語はまだ無い'
  const head = item.nums.slice(0, 6).join(' ')
  const rest = item.nums.length > 6 ? ` +${item.nums.length - 6}` : ''
  return `割当 ${item.nums.length} 番号 · ${head}${rest}`
}

/**
 * 読み → 2桁数字 のドリル。範囲内をシャッフルして重複なしに1問ずつ出す
 * (count が範囲より多ければ範囲の全件でそのまま打ち止め)。
 */
export function buildYomiQuestions(
  items: YomiItem[],
  count: number,
  rand: () => number = Math.random
): KeypadQuestion[] {
  const picked = shuffle(items, rand)
  const limited = count > 0 ? picked.slice(0, count) : picked
  return limited.map((item) => ({
    prompt: item.kana,
    answer: item.digits,
    note: usageNote(item),
  }))
}
