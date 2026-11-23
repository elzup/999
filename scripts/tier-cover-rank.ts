// ティアカバーのカバー率ランキング。語を足すべき番号を «埋まっていない → core を通らない» の順に並べ、
// core の読みだけでつないだ名付け案 (語感の良い読み) を添える。
//
//   npx -y tsx scripts/tier-cover-rank.ts [data.json] [--out .metarc/tier-cover-rank.json]
//
// data.json は配信データ (functions/private/data.json = deploy 時の写し)。nr deploy 前なら古いことがある
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import type { NumberEntry, RulesData } from '../app/data/schema'
import { tablesFromRules } from '../app/lib/reading'
import { buildTierCover, type CoverWord } from '../app/lib/tierCover'

/** 経路のマスの重み。core を通る読みほど語感が良い (D: tier=core 優先) */
const ROW_WEIGHT = { core: 1, d0: 1, d1: 1, sub: 0.5, bad: 0 } as const
/** 3 桁を超えて読んだかな 1 文字あたりの減点。語感より «番号から思い出せるか» を削るので軽め */
const REST_PENALTY = 0.1
/** 名付け案は番号ごとにこの数まで */
const MAX_IDEAS = 6

type WordScore = { slot: string; word: string; score: number; path: string }
export type RankRow = {
  num: string
  /** 0: 語が 1 つも無い / 1: 人 (wh) が無い / 2: 人はいるが core を通らない / 3: 人が core を通る */
  level: 0 | 1 | 2 | 3
  person: WordScore | null
  thing: WordScore | null
  ideas: string[]
}

function scoreWord(num: string, w: CoverWord): WordScore {
  const covered = new Set<number>()
  let sum = 0
  for (const node of w.nodes) {
    const span = node.row === 'd0' || node.row === 'd1' ? 2 : 1
    for (let i = 0; i < span; i++) covered.add(node.col + i)
    sum += ROW_WEIGHT[node.row] * span
  }
  // 先頭の 0 を読まない (れい = 01) のは自然なので、読まなかった 0 は満点に数える
  for (let col = 0; col < num.length; col++) {
    if (!covered.has(col) && num[col] === '0') sum += 1
  }
  const score = Math.max(
    0,
    sum / num.length - REST_PENALTY * [...w.rest].length
  )
  const path =
    w.nodes.map((n) => n.row).join('-') + (w.rest ? `+${w.rest}` : '')
  return {
    slot: w.slot,
    word: w.word,
    score: Math.round(score * 100) / 100,
    path,
  }
}

const best = (scores: WordScore[]) =>
  scores.reduce<WordScore | null>(
    (a, b) => (a && a.score >= b.score ? a : b),
    null
  )

/** 語の頭に来ると言いにくい (名前にならない) かな */
const BAD_HEAD = /^[んっーぁぃぅぇぉゃゅょゎ]/
const BAD_INSIDE = /んん|ーー|っっ|っん|んっ/

/**
 * core の 1 桁読みと 2 桁読みだけで番号をつなぐ読み (sub / bad は使わない)。
 * 先頭の 0 は読まない形 (005 → こ) も出す。言いにくい並びは落とし、短い順
 */
function coreIdeas(rules: RulesData, num: string): string[] {
  const core = (d: string) => rules.singleByDigit[d]?.core ?? []
  const dbl = (x: string, y: string) => [
    ...(rules.doubleMatrix[Number(x)]?.[Number(y)] ?? []),
    ...(rules.longMatrix[Number(x)]?.[Number(y)] ?? []),
  ]
  const spell = (digits: string[]): string[] => {
    if (digits.length === 0) return ['']
    const [x, y, ...more] = digits
    const one = core(x).flatMap((k) => spell(digits.slice(1)).map((r) => k + r))
    const two =
      y === undefined
        ? []
        : dbl(x, y).flatMap((k) => spell(more).map((r) => k + r))
    return [...two, ...one]
  }
  const digits = [...num]
  const trimmed = [...num.replace(/^0+/, '')]
  const all = [
    ...spell(digits),
    ...(trimmed.length < digits.length && trimmed.length > 0
      ? spell(trimmed)
      : []),
  ]
  return [...new Set(all)]
    .filter((k) => k && !BAD_HEAD.test(k) && !BAD_INSIDE.test(k))
    .sort((p, q) => [...p].length - [...q].length)
    .slice(0, MAX_IDEAS)
}

function levelOf(
  words: CoverWord[],
  person: WordScore | null
): RankRow['level'] {
  if (words.length === 0) return 0
  if (!person) return 1
  return person.score >= 1 ? 3 : 2
}

export function rankNumbers(
  numbers: NumberEntry[],
  rules: RulesData
): RankRow[] {
  const tables = tablesFromRules(rules)
  const rows = numbers.map((entry): RankRow => {
    const { words } = buildTierCover(tables, entry)
    const scores = words.map((w) => scoreWord(entry.num, w))
    const person = best(scores.filter((s) => s.slot.startsWith('wh')))
    const thing = best(scores.filter((s) => s.slot.startsWith('wm')))
    return {
      num: entry.num,
      level: levelOf(words, person),
      person,
      thing,
      ideas: coreIdeas(rules, entry.num),
    }
  })
  return rows.sort(
    (x, y) =>
      x.level - y.level ||
      (x.person?.score ?? 0) - (y.person?.score ?? 0) ||
      x.num.localeCompare(y.num)
  )
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' } },
  })
  const path = positionals[0] ?? 'functions/private/data.json'
  const data = JSON.parse(readFileSync(path, 'utf8')) as {
    numbers: NumberEntry[]
    rules: RulesData
  }
  const rows = rankNumbers(data.numbers, data.rules)
  const counts = [0, 1, 2, 3].map(
    (lv) => rows.filter((r) => r.level === lv).length
  )
  console.log(
    `語なし ${counts[0]} / 人なし ${counts[1]} / 人が core を外す ${counts[2]} / 人が core ${counts[3]}`
  )
  for (const r of rows.slice(0, 30)) {
    const p = r.person
      ? `${r.person.word} ${r.person.score} (${r.person.path})`
      : '-'
    console.log(`${r.num} L${r.level} 人:${p} 案:${r.ideas.join(' ')}`)
  }
  if (values.out)
    writeFileSync(values.out, JSON.stringify({ source: path, rows }, null, 1))
}

main()
