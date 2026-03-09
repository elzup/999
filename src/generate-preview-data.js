import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const baseDir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(baseDir, '..', 'public')

// Numbers data
const vizData = JSON.parse(
  readFileSync(join(baseDir, 'visualize-words.data.json'), 'utf8')
)
const numbers = vizData.data.map((d) => ({
  num: d.num,
  w1: d.w1,
  w1k: d.w1k,
  w2: d.w2,
  w2k: d.w2k,
  hito: d.hito,
  mono: d.mono,
  gainen: d.gainen,
  catScore: d.catScore,
  w1Score: d.w1Score,
  w1Pattern: d.w1Pattern,
  w1Error: d.w1Error,
  w2Score: d.w2Score,
  w2Error: d.w2Error,
}))

// Cards data
const cardsTsv = readFileSync(join(baseDir, 'data', 'cards.tsv'), 'utf8')
const cards = cardsTsv
  .split('\n')
  .slice(1)
  .filter((l) => l.trim())
  .map((line) => {
    const cols = line.split('\t')
    return {
      suit: cols[0],
      rank: cols[1],
      hito: cols[2],
      hitoYomi: cols[3],
      dousa: cols[4],
      dousaYomi: cols[5],
      mono: cols[6],
      monoYomi: cols[7],
    }
  })

const out = { numbers, cards }
writeFileSync(join(publicDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated public/data.json (${numbers.length} numbers, ${cards.length} cards)`
)
