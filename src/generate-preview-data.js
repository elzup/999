import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SINGLE_DIGIT, SINGLE_TIER, DOUBLE_DIGIT, LONG_DIGIT } from './table.js'
import { WEIGHTS } from './scorer.js'

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

const out = { numbers, cards, rules }
writeFileSync(join(publicDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated public/data.json (${numbers.length} numbers, ${
    cards.length
  } cards, rules: ${Object.keys(rules.singleByDigit).length} digits)`
)
