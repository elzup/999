// 番号の悪い順 (候補タブ 代表 > 悪い順)。語の良し悪しを «当たる型のうち一番悪い型の順位» で比べ、
// 番号ごとに一番良い語を使う (D-0127)。人 / 物の別は見ない (物なしは後回しでよい: 2026-11-23)。
// 型の並びは D-0126〜D-0131 の 20 項目 (.metarc/score-order.html v11)。点はまだ付けていない仮の並び。
// scripts/worst-rank.mjs (分析ページ) と同じ判定。
import type { NumberEntry, RulesData } from '../data/schema'
import { slotCandidates } from './choice'
import { rankeyOf } from './rankey'

/** 型の並び (上ほど良い) */
export const PATTERN_ORDER = [
  ['double', '2桁を直音 1 拍で読む'],
  ['zeroDouble', '00 を直音 1 拍で読む'],
  ['youon', '2桁を拗音・外来音 1 拍で読む'],
  ['sokuon', '促音 (後の 1 桁の拍を写す)'],
  ['zeroFill', '先頭桁の 00 を省く'],
  ['zeroXY', '先頭桁の 0 を省く'],
  ['regular3', '1 桁 × 3 拍'],
  ['sokuon2', '促音 (後の 2 桁の拍を写す)'],
  ['jiDouble', '6X を ジの拗音 で読む'],
  ['restSoft', '語末の余り: 撥音 / 長音'],
  ['mix', '同じ数字を別の仮名で読む'],
  ['rest1', '語末の余り: 1 拍'],
  ['omitSokuon', '語中の促音を読まない'],
  ['rest2', '語末の余り: 2 拍以上'],
  ['zeroRead', '先頭桁の 0 を読む'],
  ['zeroHalf', '先頭桁の 00 の片方だけ省く'],
  ['halfOverflow', '拍が 3 桁の境界をまたぐ'],
  ['half', '半指定'],
  ['omit', '語中の長音・撥音・直音を読まない'],
  ['concept', '概念タグの語'],
] as const

export type PatternId = (typeof PATTERN_ORDER)[number][0]
const RANK = Object.fromEntries(
  PATTERN_ORDER.map(([id], i) => [id, i + 1])
) as Record<PatternId, number>
export const patternName = (id: PatternId) =>
  `${RANK[id]}. ${PATTERN_ORDER[RANK[id] - 1][1]}`

/** 1 桁の拍の格の点 (D-0130)。A/B/C = core/sub/bad */
const TIER_PT: Record<string, number> = { A: 1, B: 0.8, C: 0.6 }
const MAX_IDEAS = 6

type Token = { kind: string; col: number; tier?: string }

/** rankey の本体を 1 拍ずつに分ける。col は番号の桁位置 */
function parseBody(rk: string): Token[] {
  const body = rk.split('|')[0].replace(/!/g, '')
  const out: Token[] = []
  let col = 0
  for (let i = 0; i < body.length; i++) {
    const mark = body[i]
    const next = body[i + 1]
    if (mark === '_') out.push({ kind: 'omit0', col: col++ })
    else if (mark === 't' && next === 'w') {
      out.push({ kind: 'sokuon2', col })
      col += 2
      i++
    } else if (mark === 't') out.push({ kind: 'sokuon', col: col++ })
    else if (mark === 'v') out.push({ kind: 'cross', col: col++ })
    else if (mark === 'h') out.push({ kind: 'half', col: col++ })
    else if (next === 'x' || (mark === 'w' && next === 'w')) {
      out.push({ kind: next === 'x' ? 'youon' : 'double', col })
      col += 2
      i++
    } else out.push({ kind: 'single', tier: mark, col: col++ })
  }
  return out
}

export type Graded = {
  kana: string
  rankey: string
  /** 当たる型 (良い順) */
  ids: PatternId[]
  /** 一番悪い型の順位 (小さいほど良い) */
  worst: number
  /** 1 桁の拍の格の平均 (1 桁の拍が無ければ 1) */
  tier: number
}

/** よみ・rankey・番号から当たる型を全部出す */
export function grade(
  num: string,
  kana: string,
  rk: string,
  isConcept = false
): Graded {
  const toks = parseBody(rk)
  const suffix = rk.split('|')[1] ?? ''
  const hits = new Set<PatternId>()
  const zeros = toks.filter((t) => t.kind === 'omit0').length
  for (const t of toks) {
    if (t.kind === 'double')
      hits.add(t.col === 0 && num.startsWith('00') ? 'zeroDouble' : 'double')
    if (t.kind === 'youon')
      hits.add(
        num[t.col] === '6' && /じ[ゃゅょ]/.test(kana) ? 'jiDouble' : 'youon'
      )
    if (t.kind === 'sokuon') hits.add('sokuon')
    if (t.kind === 'sokuon2') hits.add('sokuon2')
    if (t.kind === 'cross') hits.add('halfOverflow')
    if (t.kind === 'half') hits.add('half')
  }
  if (zeros === 2) hits.add('zeroFill')
  if (zeros === 1) hits.add(num[1] === '0' ? 'zeroHalf' : 'zeroXY')
  if (num[0] === '0' && zeros === 0 && toks[0]?.kind === 'single')
    hits.add('zeroRead')
  if (
    toks.length === 3 &&
    toks.every((t) => t.kind === 'single') &&
    num[0] !== '0'
  )
    hits.add('regular3')
  if (rk.includes('!')) hits.add(kana.includes('ｯ') ? 'omitSokuon' : 'omit')
  const rest = suffix.replace(/[vwm]/g, '')
  if (rest === 'n' || rest === '-') hits.add('restSoft')
  else if (rest === '.') hits.add('rest1')
  else if (rest === '..') hits.add('rest2')
  if (suffix.includes('m')) hits.add('mix')
  if (isConcept) hits.add('concept')
  const singles = toks.filter((t) => t.kind === 'single')
  const tier = singles.length
    ? singles.reduce((sum, t) => sum + (TIER_PT[t.tier ?? ''] ?? 0), 0) /
      singles.length
    : 1
  const ids = [...hits].sort((a, b) => RANK[a] - RANK[b])
  return {
    kana,
    rankey: rk,
    ids,
    worst: ids.length ? RANK[ids[ids.length - 1]] : RANK.double,
    tier: Math.round(tier * 100) / 100,
  }
}

/** 良い方が先: 一番悪い型が上 → 1 桁の拍の格が高い → 拍が少ない */
export const better = (a: Graded, b: Graded) =>
  a.worst - b.worst ||
  b.tier - a.tier ||
  [...a.kana].length - [...b.kana].length

export type GradedWord = Graded & { slot: string; word: string }

export type WorstRow = {
  num: string
  entry: NumberEntry | undefined
  /** 良い順。空なら語なし */
  words: GradedWord[]
}

/** 番号の語を全部採点して良い順に並べる */
export function gradeWords(entry: NumberEntry): GradedWord[] {
  return slotCandidates(entry)
    .flatMap((cand) => {
      const rk = rankeyOf(cand.kana, entry.num, cand.word)
      if (!rk) return []
      return [
        {
          ...grade(entry.num, cand.kana, rk, /#g\b/.test(cand.word)),
          slot: cand.slot,
          word: cand.word,
        },
      ]
    })
    .sort(better)
}

/** 000〜999 を悪い順に。語なしが先、次に一番良い語が悪い順 */
export function worstRows(numbers: NumberEntry[]): WorstRow[] {
  const byNum = new Map(numbers.map((entry) => [entry.num, entry]))
  const rows = Array.from({ length: 1000 }, (_, i) => {
    const num = String(i).padStart(3, '0')
    const entry = byNum.get(num)
    return { num, entry, words: entry ? gradeWords(entry) : [] }
  })
  const key = (row: WorstRow) => row.words[0]
  return rows.sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0) || a.num.localeCompare(b.num)
    return better(y, x) || a.num.localeCompare(b.num)
  })
}

/** 表 (1 桁の core/sub/bad と 2 桁) から番号を読む当て方を作り、良い順に。先頭桁の 0 の省略も含む */
export function readingIdeas(rules: RulesData, num: string): Graded[] {
  const one = (d: string) =>
    (['core', 'sub', 'bad'] as const).flatMap(
      (tier) => rules.singleByDigit[d]?.[tier] ?? []
    )
  const two = (x: string, y: string) => [
    ...(rules.doubleMatrix[Number(x)]?.[Number(y)] ?? []),
    ...(rules.longMatrix[Number(x)]?.[Number(y)] ?? []),
  ]
  const spell = (ds: string[]): string[] => {
    if (ds.length === 0) return ['']
    const [x, y] = ds
    return [
      ...(y === undefined
        ? []
        : two(x, y).flatMap((k) => spell(ds.slice(2)).map((r) => k + r))),
      ...one(x).flatMap((k) => spell(ds.slice(1)).map((r) => k + r)),
    ]
  }
  const starts = [
    ...new Set([num, num.replace(/^0/, ''), num.replace(/^00/, '')]),
  ]
  const seen = new Set<string>()
  const out: Graded[] = []
  for (const kana of starts.filter(Boolean).flatMap((s) => spell([...s]))) {
    if (!kana || seen.has(kana) || /^[んー]/.test(kana)) continue
    seen.add(kana)
    const rk = rankeyOf(kana, num)
    if (rk) out.push(grade(num, kana, rk))
  }
  return out.sort(better).slice(0, MAX_IDEAS)
}
