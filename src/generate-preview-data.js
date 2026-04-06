import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

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
  first: z.string().default(''),
  score: z.number().nullable().default(null),
  secondary: z.string().default(''),
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
const MARK_SUIT = { '♠️': 'S', '♠': 'S', '♥️': 'H', '♥': 'H', '♣️': 'C', '♣': 'C', '♦️': 'D', '♦': 'D' }

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
      first: (cols[colIdx('first')] ?? '') || (cols[colIdx('B')] ?? '') || (cols[colIdx('I')] ?? ''),
      score: parseScore((cols[colIdx('score')] ?? '') || (cols[colIdx('C')] ?? '')),
      secondary: (cols[colIdx('secondary(flip)')] ?? '') || (cols[colIdx('secondary')] ?? '') || (cols[colIdx('D')] ?? '') || (cols[colIdx('U')] ?? ''),
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

const out = { numbers, cards }
writeFileSync(join(publicDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated public/data.json (${numbers.length} numbers, ${cards.length} cards)`
)
