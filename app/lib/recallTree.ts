import type { NumberEntry, RulesData } from '../data/schema'

export type Tier = 'core' | 'sub' | 'bad' | 'double'

export type ReadingPart = {
  kana: string
  tier: Tier
  digit: string
}

export type Example = {
  num: string
  word: string
}

export type Combo = {
  kana: string
  type: 'double' | 'single'
  mix: boolean
  parts: ReadingPart[]
  examples: Example[]
}

export type DistItem = {
  kana: string
  count: number
}

export type Distribution = {
  items: DistItem[]
  other: number
  unregistered: number
  total: number
}

export type RecallTree = {
  num: string
  head: { digit: number; readings: ReadingPart[] }
  tail: string
  combos: Combo[]
  dist: Distribution
  assigned: NumberEntry | null
}

const TIER_RANK: Record<Tier, number> = { core: 0, sub: 1, bad: 2, double: -1 }

/** 数字1桁の読み（core→sub→bad の順, tier 付き） */
function digitReadings(digit: string, rules: RulesData): ReadingPart[] {
  const bucket = rules.singleByDigit[digit] ?? { core: [], sub: [], bad: [] }
  return (['core', 'sub', 'bad'] as const).flatMap((tier) =>
    (bucket[tier] ?? []).map((kana) => ({ kana, tier, digit }))
  )
}

/** 2桁ペアの2文字読み（doubleMatrix + longMatrix） */
function pairDoubleReadings(y: number, z: number, rules: RulesData): string[] {
  const dbl = rules.doubleMatrix?.[y]?.[z] ?? []
  const lng = rules.longMatrix?.[y]?.[z] ?? []
  return [...new Set([...dbl, ...lng])]
}

/** 単語表記からタグ(#)・注釈(,括弧)を除いた表示名を取り出す */
function cleanWord(w: string): string {
  return w
    .split('#')[0]
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .trim()
}

/** 同じ下2桁を持つ兄弟番号の中で、末尾がこの読みに一致する語を集める */
function findExamples(siblings: NumberEntry[], kana: string): Example[] {
  return siblings
    .filter((s) => s.w1k && s.w1k.endsWith(kana))
    .map((s) => ({ num: s.num, word: cleanWord(s.w1) || s.w1k }))
}

function comboSortKey(c: Combo): number {
  if (c.type === 'double') return -1
  return c.parts.reduce((sum, p) => sum + TIER_RANK[p.tier], 0)
}

/**
 * 想起ツリーを構築する。先頭桁 X を固定し、下2桁 YZ の読み組み合わせを
 * tier の高い順（2文字読み → core → sub → bad）に列挙する。
 */
export function buildRecallTree(
  num: string,
  rules: RulesData,
  numbers: NumberEntry[]
): RecallTree | null {
  if (!/^\d{3}$/.test(num)) return null

  const [x, y, z] = [...num].map(Number)
  const tail = num.slice(1)
  const siblings = numbers.filter((n) => n.num.slice(1) === tail)

  const combos: Combo[] = []

  for (const dk of pairDoubleReadings(y, z, rules)) {
    combos.push({
      kana: dk,
      type: 'double',
      mix: false,
      parts: [{ kana: dk, tier: 'double', digit: tail }],
      examples: findExamples(siblings, dk),
    })
  }

  const yReadings = digitReadings(String(y), rules)
  const zReadings = digitReadings(String(z), rules)
  for (const a of yReadings) {
    for (const b of zReadings) {
      const kana = a.kana + b.kana
      combos.push({
        kana,
        type: 'single',
        mix: y === z && a.kana !== b.kana,
        parts: [a, b],
        examples: findExamples(siblings, kana),
      })
    }
  }

  combos.sort((a, b) => {
    const ka = comboSortKey(a)
    const kb = comboSortKey(b)
    if (ka !== kb) return ka - kb
    return b.examples.length - a.examples.length
  })

  return {
    num,
    head: { digit: x, readings: digitReadings(String(x), rules) },
    tail,
    combos,
    dist: buildDistribution(siblings, combos),
    assigned: numbers.find((n) => n.num === num) ?? null,
  }
}

/**
 * 同じ下2桁を持つ兄弟番号（0YZ〜9YZ）の登録語が、各読みをどの割合で
 * 採用しているかの分布。どの読みにも一致しない語は other（融合・余り等）。
 */
function buildDistribution(
  siblings: NumberEntry[],
  combos: Combo[]
): Distribution {
  const registered = siblings.filter((s) => s.w1k)
  const items = combos
    .filter((c) => c.examples.length > 0)
    .map((c) => ({ kana: c.kana, count: c.examples.length }))
  const matched = registered.filter((s) =>
    combos.some((c) => s.w1k.endsWith(c.kana))
  ).length
  return {
    items,
    other: registered.length - matched,
    unregistered: siblings.length - registered.length,
    total: siblings.length,
  }
}
