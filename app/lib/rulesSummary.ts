import type { RulesData } from '../data/schema'

export type SingleReading = {
  kana: string
  tier: 'core' | 'sub' | 'bad'
}

export type DoubleKanaItem = {
  kana: string
  isLong: boolean
}

export type DoubleReading = {
  num: string
  kanas: DoubleKanaItem[]
}

export type RuleSummaryRow = {
  digit: number
  isFirstInGroup: boolean
  singleDigitLabel: string
  single?: SingleReading
  double?: DoubleReading
}

export type BuildRuleSummaryOptions = {
  hideLong?: boolean
}

/**
 * RulesData から「1桁かな」と「その数字から始まる2桁かな」を整理・結合した
 * 行リストを生成する。
 */
export function buildRuleSummaryRows(
  rules: RulesData,
  options: BuildRuleSummaryOptions = {}
): RuleSummaryRow[] {
  const { hideLong = false } = options
  const rows: RuleSummaryRow[] = []

  for (let d = 0; d <= 9; d++) {
    // 1. 1桁かな (core -> sub -> bad の順)
    const bucket = rules.singleByDigit[String(d)] ?? {
      core: [],
      sub: [],
      bad: [],
    }
    const singles: SingleReading[] = (['core', 'sub', 'bad'] as const).flatMap(
      (tier) => (bucket[tier] ?? []).map((kana) => ({ kana, tier }))
    )

    // 2. 2桁かな (d0 .. d9)
    const doubles: DoubleReading[] = []
    for (let c = 0; c <= 9; c++) {
      const num = `${d}${c}`
      const kanas: DoubleKanaItem[] = []

      const dblKanas = rules.doubleMatrix?.[d]?.[c] ?? []
      for (const k of dblKanas) {
        kanas.push({ kana: k, isLong: false })
      }

      if (!hideLong) {
        const lngKanas = rules.longMatrix?.[d]?.[c] ?? []
        for (const k of lngKanas) {
          kanas.push({ kana: k, isLong: true })
        }
      }

      if (kanas.length > 0) {
        doubles.push({ num, kanas })
      }
    }

    // 3. 1桁と2桁のリストを行として合成
    const maxLen = Math.max(singles.length, doubles.length, 1)
    for (let i = 0; i < maxLen; i++) {
      rows.push({
        digit: d,
        isFirstInGroup: i === 0,
        singleDigitLabel: i === 0 ? String(d) : `(${d})`,
        single: singles[i],
        double: doubles[i],
      })
    }
  }

  return rows
}
