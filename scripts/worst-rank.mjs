// 悪い順ページ: 番号を «埋まり方 → 一番良い語の型» で悪い順に並べ、開くと ティアカバーの格子と
// 表から作った良い当て方 (語呂の候補) を出す。未割り当ての番号も開ける。
//
//   node scripts/worst-rank.mjs   → .metarc/worst-rank.html
//
// 入力: .metarc/rankey-catalog.data.json (DB の語。scripts/rankey-catalog.mjs --db で作る)
//       functions/private/data.json (rules と 概念タグ #g)
// 型の並びは .metarc/score-order.html v11 (D-0131) の 20 項目。点はまだ付けず、順位で比べる (仮)
import { readFileSync, writeFileSync } from 'node:fs'
import { rankey } from '../src/rankey.js'

/** 型の並び (上ほど良い)。D-0126〜D-0131 */
export const ORDER = [
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
]
const RANK = Object.fromEntries(ORDER.map(([id], i) => [id, i + 1]))
const TIER_PT = { A: 1, B: 0.8, C: 0.6 }
const MAX_IDEAS = 8

/** rankey の本体を 1 拍ずつに分ける。col は番号の桁位置 */
function parseBody(rk) {
  const body = rk.split('|')[0].replace(/!/g, '')
  const out = []
  let col = 0
  for (let i = 0; i < body.length; i++) {
    const m = body[i]
    const next = body[i + 1]
    if (m === '_') out.push({ kind: 'omit0', col: col++ })
    else if (m === 't') {
      if (next === 'w') {
        out.push({ kind: 'sokuon2', col })
        col += 2
        i++
      } else out.push({ kind: 'sokuon', col: col++ })
    } else if (m === 'v') out.push({ kind: 'cross', col: col++ })
    else if (m === 'h') out.push({ kind: 'half', col: col++ })
    else if (next === 'x' || (m === 'w' && next === 'w')) {
      out.push({ kind: next === 'x' ? 'youon' : 'double', col })
      col += 2
      i++
    } else out.push({ kind: 'single', tier: m, col: col++ })
  }
  return out
}

/** よみ・rankey・番号から当たる型を全部出す */
export function patternsOf(num, kana, rk, isConcept) {
  const toks = parseBody(rk)
  const suffix = rk.split('|')[1] ?? ''
  const hits = new Set()
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
    ? singles.reduce((s, t) => s + (TIER_PT[t.tier] ?? 0), 0) / singles.length
    : 1
  const ids = [...hits].sort((a, b) => RANK[a] - RANK[b])
  const worst = ids.length ? RANK[ids.at(-1)] : RANK.double
  return { ids, worst, tier: Math.round(tier * 100) / 100, toks }
}

/** 良い方が先: 一番悪い型が上 → 1 桁の拍の格が高い → 拍が少ない */
const better = (a, b) =>
  a.worst - b.worst ||
  b.tier - a.tier ||
  [...a.kana].length - [...b.kana].length

/** 表 (1 桁の core/sub/bad と 2 桁) から番号を読む当て方を全部作る。先頭桁の 0 の省略も含む */
function ideasFor(rules, num) {
  const one = (d) =>
    ['core', 'sub', 'bad'].flatMap((t) => rules.singleByDigit[d]?.[t] ?? [])
  const two = (x, y) => [
    ...(rules.doubleMatrix[x]?.[y] ?? []),
    ...(rules.longMatrix[x]?.[y] ?? []),
  ]
  const spell = (ds) => {
    if (ds.length === 0) return ['']
    const [x, y] = ds
    return [
      ...(y === undefined
        ? []
        : two(x, y).flatMap((k) => spell(ds.slice(2)).map((r) => k + r))),
      ...one(x).flatMap((k) => spell(ds.slice(1)).map((r) => k + r)),
    ]
  }
  const starts = [num, num.replace(/^0/, ''), num.replace(/^00/, '')].filter(
    (s, i, a) => s && a.indexOf(s) === i
  )
  const seen = new Set()
  const out = []
  for (const kana of starts.flatMap((s) => spell([...s]))) {
    if (!kana || seen.has(kana) || /^[んー]/.test(kana)) continue
    seen.add(kana)
    let rk
    try {
      rk = rankey(kana, num)
    } catch {
      continue
    }
    if (!rk) continue
    const p = patternsOf(num, kana, rk, false)
    out.push({ kana, rk, worst: p.worst, tier: p.tier, ids: p.ids })
  }
  return out.sort(better).slice(0, MAX_IDEAS)
}

function main() {
  const rows = Object.values(
    JSON.parse(readFileSync('.metarc/rankey-catalog.data.json', 'utf8'))
  )
  const data = JSON.parse(readFileSync('functions/private/data.json', 'utf8'))
  const concept = new Set()
  for (const e of data.numbers)
    for (const k of ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3'])
      if (/#g\b/.test(e[k] ?? '')) concept.add(`${e.num}|${e[`${k}k`]}`)
  const byNum = {}
  for (const [num, slot, word, kana, rk] of rows) {
    if (!rk) continue
    const p = patternsOf(num, kana, rk, concept.has(`${num}|${kana}`))
    ;(byNum[num] ??= []).push({
      kind: slot.startsWith('wm') ? 'm' : 'h',
      word,
      kana,
      rk,
      worst: p.worst,
      tier: p.tier,
      ids: p.ids,
      toks: p.toks,
    })
  }
  const nums = Array.from({ length: 1000 }, (_, i) =>
    String(i).padStart(3, '0')
  )
  const list = nums.map((num) => {
    const words = (byNum[num] ?? []).sort(better)
    const m = words.find((w) => w.kind === 'm') ?? null
    const h = words.find((w) => w.kind === 'h') ?? null
    // 埋まり方: 0 語なし / 1 人だけ (物なし) / 2 物だけ / 3 両方。物がある方が良い (D-0127 の前提)
    const fill = !m && !h ? 0 : !m ? 1 : !h ? 2 : 3
    return { num, fill, m, h, words, ideas: ideasFor(data.rules, num) }
  })
  const grid = {
    single: Object.fromEntries(Object.entries(data.rules.singleByDigit)),
    double: data.rules.doubleMatrix.map((row, x) =>
      row.map((ks, y) => [...ks, ...(data.rules.longMatrix[x]?.[y] ?? [])])
    ),
  }
  const tpl = readFileSync('scripts/worst-rank.template.html', 'utf8')
  const html = tpl.replace(
    '/*@@DATA@@*/',
    () =>
      `const ORDER = ${JSON.stringify(ORDER)}\nconst LIST = ${JSON.stringify(list)}\nconst GRID = ${JSON.stringify(grid)}\nconst BUILT = ${JSON.stringify(new Date().toISOString().slice(0, 16))}`
  )
  writeFileSync('.metarc/worst-rank.html', html)
  const c = [0, 1, 2, 3].map((f) => list.filter((r) => r.fill === f).length)
  console.log(
    `語なし ${c[0]} / 人だけ ${c[1]} / 物だけ ${c[2]} / 両方 ${c[3]}  → .metarc/worst-rank.html (${Math.round(html.length / 1024)} KB)`
  )
}

main()
