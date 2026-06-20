import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SINGLE_DIGIT, SINGLE_TIER, DOUBLE_DIGIT, LONG_DIGIT } from './table.js'
import { WEIGHTS } from './scorer.js'
import { classify } from './goro-extract.js'
import { extractName, isKanaOnly, toHiragana } from './words.js'

const baseDir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(baseDir, '..', 'public')

const NumberSchema = z.object({
  num: z.string().regex(/^\d{3}$/),
  w1: z.string().default(''),
  w1k: z.string().default(''),
  w2: z.string().default(''),
  w2k: z.string().default(''),
  hito: z.string().default(''),
  mono: z.string().default(''),
  gainen: z.string().default(''),
  catScore: z.number().nullable().default(null),
  w1Score: z.number().nullable().default(null),
  w1Pattern: z.string().optional(),
  w1Error: z.union([z.boolean(), z.string()]).optional(),
  w2Score: z.number().nullable().default(null),
  w2Error: z.union([z.boolean(), z.string()]).optional(),
  w1Img: z.string().optional(),
  w2Img: z.string().optional(),
})

const CardSchema = z.object({
  suit: z.enum(['S', 'H', 'C', 'D']),
  rank: z.string().min(1),
  person: z.string().default(''),
  actionP: z.string().default(''),
  personScore: z.number().nullable().default(null),
  object: z.string().default(''),
  actionO: z.string().default(''),
  objectScore: z.number().nullable().default(null),
  action: z.string().default(''),
  actionScore: z.number().nullable().default(null),
})

// Numbers data
const vizData = JSON.parse(
  readFileSync(join(baseDir, 'visualize-words.data.json'), 'utf8')
)
const numbers = vizData.data
  .map((d) => {
    const result = NumberSchema.safeParse(d)
    if (!result.success) {
      console.warn(`Skip number: ${d.num}`, result.error.issues[0]?.message)
      return null
    }
    return result.data
  })
  .filter(Boolean)

// Cards data
const MARK_SUIT = {
  '♠️': 'S',
  '♠': 'S',
  '♥️': 'H',
  '♥': 'H',
  '♣️': 'C',
  '♣': 'C',
  '♦️': 'D',
  '♦': 'D',
}

function parseMark(mark) {
  for (const [sym, suit] of Object.entries(MARK_SUIT)) {
    if (mark.startsWith(sym)) return { suit, rank: mark.slice(sym.length) }
    if (mark.endsWith(sym)) return { suit, rank: mark.slice(0, -sym.length) }
  }
  return null
}

const cardsTsv = readFileSync(join(baseDir, 'data', 'cards.tsv'), 'utf8')
const cardLines = cardsTsv.split('\n').filter((l) => l.trim())
const cardHeaders = cardLines[0].split('\t').map((h) => h.trim())
const cards = cardLines
  .slice(1)
  .map((line) => {
    const cols = line.split('\t').map((c) => c.trim())
    const colIdx = (name) => cardHeaders.indexOf(name)
    const mark = cols[colIdx('mark')] ?? ''
    const parsed = parseMark(mark)
    if (!parsed) {
      console.warn(`Skip card mark: ${mark}`)
      return null
    }
    const raw = {
      suit: parsed.suit,
      rank: parsed.rank,
      person: cols[colIdx('person')] ?? '',
      actionP: cols[colIdx('action_p')] ?? '',
      personScore: parseScore(cols[colIdx('score_p')] ?? ''),
      object: cols[colIdx('object')] ?? '',
      actionO: cols[colIdx('action_o')] ?? '',
      objectScore: parseScore(cols[colIdx('score_o')] ?? ''),
      action: cols[colIdx('action')] ?? '',
      actionScore: parseScore(cols[colIdx('score_a')] ?? ''),
    }
    const result = CardSchema.safeParse(raw)
    if (!result.success) {
      console.warn(`Skip card: ${mark}`, result.error.issues[0]?.message)
      return null
    }
    return result.data
  })
  .filter(Boolean)

function parseScore(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(3, value))
}

// --- Rules data -----------------------------------------------------------

function buildRulesData() {
  // 1桁: 0..9 ごとに core/sub/bad のかなを集める
  const singleByDigit = {}
  for (let d = 0; d <= 9; d++) {
    singleByDigit[d] = { core: [], sub: [], bad: [] }
  }
  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const tier = SINGLE_TIER[kana]
    if (tier && singleByDigit[digit]?.[tier]) {
      singleByDigit[digit][tier].push(kana)
    }
  }

  // 2桁マトリクス: matrix[row][col] = [kana, ...]
  const buildMatrix = (digitMap) => {
    const matrix = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => [])
    )
    for (const [kana, digits] of Object.entries(digitMap)) {
      if (digits.length !== 2) continue
      const r = Number(digits[0])
      const c = Number(digits[1])
      if (r >= 0 && r <= 9 && c >= 0 && c <= 9) matrix[r][c].push(kana)
    }
    return matrix
  }

  return {
    singleByDigit,
    doubleMatrix: buildMatrix(DOUBLE_DIGIT),
    longMatrix: buildMatrix(LONG_DIGIT),
    weights: WEIGHTS,
  }
}

const rules = buildRulesData()

// words.tsv から 2枠目穴埋め用の w1_2/w2_2 (語) を取り込む
const wordsPath = join(baseDir, 'data', 'words.tsv')
const sub = {}
if (existsSync(wordsPath)) {
  const lines = readFileSync(wordsPath, 'utf8').split('\n').filter(Boolean)
  const header = lines[0].split('\t')
  const i12 = header.indexOf('w1_2')
  const i22 = header.indexOf('w2_2')
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    sub[c[0]] = { w1_2: c[i12]?.trim() || '', w2_2: c[i22]?.trim() || '' }
  }
}

// 画像 manifest (word-images.json) があれば各スロットの画像URLを merge
const imagesPath = join(baseDir, 'data', 'word-images.json')
if (existsSync(imagesPath)) {
  const { images } = JSON.parse(readFileSync(imagesPath, 'utf8'))
  for (const n of numbers) {
    const slots = images?.[n.num]
    const s = sub[n.num]
    if (s) {
      if (s.w1_2) n.w1_2 = s.w1_2
      if (s.w2_2) n.w2_2 = s.w2_2
    }
    if (!slots) continue
    if (slots.w1?.url) n.w1Img = slots.w1.url
    if (slots.w2?.url) n.w2Img = slots.w2.url
    if (slots.w1_2?.url) n.w1_2Img = slots.w1_2.url
    if (slots.w2_2?.url) n.w2_2Img = slots.w2_2.url
  }
}

// 各番号のゴロ分類を事前計算（割り当てグラフ用）。
// t=下2桁[1,2] / h=上2桁[0,1]、1=w1k 2=w2k 3=w1_2 4=w2_2。{ k, d } か null。
const cls = (kana, P) => {
  const g = classify(kana, P)
  return g ? { k: g.key, d: g.kind } : null
}
// 予備語はかな化できる語のみ読みにする（漢字は除外）
const kanaOf = (word) => {
  const name = extractName(word || '')
  return name && isKanaOnly(name) ? toHiragana(name) : ''
}
for (const n of numbers) {
  const s = sub[n.num] || {}
  if (s.w1_2) n.w1_2 = s.w1_2
  if (s.w2_2) n.w2_2 = s.w2_2
  const w12k = kanaOf(s.w1_2)
  const w22k = kanaOf(s.w2_2)
  n.ga = {
    t1: cls(n.w1k, [1, 2]),
    t2: cls(n.w2k, [1, 2]),
    t3: cls(w12k, [1, 2]),
    t4: cls(w22k, [1, 2]),
    h1: cls(n.w1k, [0, 1]),
    h2: cls(n.w2k, [0, 1]),
    h3: cls(w12k, [0, 1]),
    h4: cls(w22k, [0, 1]),
  }
}

const out = { numbers, cards, rules }
writeFileSync(join(publicDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated public/data.json (${numbers.length} numbers, ${
    cards.length
  } cards, rules: ${Object.keys(rules.singleByDigit).length} digits)`
)
