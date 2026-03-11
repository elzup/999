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
  hito: z.string().default(''),
  hitoYomi: z.string().default(''),
  dousa: z.string().default(''),
  dousaYomi: z.string().default(''),
  mono: z.string().default(''),
  monoYomi: z.string().default(''),
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
const cardsTsv = readFileSync(join(baseDir, 'data', 'cards.tsv'), 'utf8')
const cards = cardsTsv
  .split('\n')
  .slice(1)
  .filter((l) => l.trim())
  .map((line) => {
    const cols = line.split('\t')
    const raw = {
      suit: cols[0],
      rank: cols[1],
      hito: cols[2],
      hitoYomi: cols[3],
      dousa: cols[4],
      dousaYomi: cols[5],
      mono: cols[6],
      monoYomi: cols[7],
    }
    const result = CardSchema.safeParse(raw)
    if (!result.success) {
      console.warn(`Skip card: ${raw.suit}${raw.rank}`, result.error.issues[0]?.message)
      return null
    }
    return result.data
  })
  .filter(Boolean)

const out = { numbers, cards }
writeFileSync(join(publicDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated public/data.json (${numbers.length} numbers, ${cards.length} cards)`
)
