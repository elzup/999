import type {
  NumberEntry,
  RulesData,
  YomiUse,
  YomiUseHit,
} from '../data/schema'
import type { KeypadQuestion } from '../components/KeypadQuiz'
import type { ChoiceQuestion } from '../components/ChoiceQuiz'
import { buildAssocQuiz, type AssocItem } from './assocQuiz'
import { candidateAt } from './choice'

export type YomiKind = 'youon' | 'long'

/** かな2文字の読み1件。uses = 割当先 (番号 × スロット)、nums = その番号 (重複なし) */
export type YomiItem = {
  kana: string
  digits: string
  kind: YomiKind
  uses: YomiUseHit[]
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
      kanas.filter(isTwoChar).map((kana) => {
        const uses = yomiUse?.[kana] ?? []
        return {
          kana,
          digits: `${r}${c}`,
          kind,
          uses,
          nums: [...new Set(uses.map((use) => use.num))],
        }
      })
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

/** scope 内の読みを 1 つでも使っている番号の集合 */
export function scopedNums(items: readonly YomiItem[]): Set<string> {
  return new Set(items.flatMap((item) => item.nums))
}

/**
 * 語からタグ (#akn) と末尾ラベル (-j) を落とす。4択の選択肢に編集用の記号が
 * 混ざると、語そのものより記号で見分けられてしまう。
 */
const quizWord = (word: string) =>
  word
    .split('#')[0]
    .replace(/\s+-\w+$/, '')
    .trim()

/**
 * 範囲内の読みを使う番号を (num, word) に落とす。
 * word は yomiUse が記録している根拠スロットの語。番号だけで先頭候補を採ると、
 * 773 (本命 ななみん / 対抗 にゅさ=入札) のように読みを含まない語が出てしまう。
 * 同じ番号が複数スロットで当たる場合は最初の 1 つだけ出題する。
 */
export function yomiWordPool(
  entries: readonly NumberEntry[],
  items: readonly YomiItem[]
): AssocItem[] {
  const slotsByNum = new Map<string, YomiUseHit['slot'][]>()
  for (const item of items) {
    for (const use of item.uses) {
      slotsByNum.set(use.num, [...(slotsByNum.get(use.num) ?? []), use.slot])
    }
  }
  return entries.flatMap((entry) => {
    const slots = slotsByNum.get(entry.num)
    if (!slots) return []
    for (const slot of slots) {
      const word = quizWord(candidateAt(entry, slot)?.word ?? '')
      if (word) return [{ num: entry.num, word }]
    }
    return []
  })
}

/** 番号 → 語 の4択。count が 0 なら pool の全件。 */
export function buildYomiWordQuestions(
  pool: readonly AssocItem[],
  count: number,
  rng: () => number = Math.random
): ChoiceQuestion[] {
  return buildAssocQuiz(pool, count > 0 ? count : pool.length, rng)
}
