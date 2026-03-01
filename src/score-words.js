import { loadWords, scoreEntry, categoryScore } from './words.js'

const entries = loadWords()
const scored = entries.map(scoreEntry)

const withW1 = scored.filter((e) => e.w1k)
const errors = withW1.filter((e) => e.w1Error)
const valid = withW1.filter((e) => !e.w1Error)

// --- completion ---
const hasHito = entries.filter((e) => e.hito).length
const hasMono = entries.filter((e) => e.mono).length
const hasGainen = entries.filter((e) => e.gainen).length
const hasW1k = entries.filter((e) => e.w1k).length
const hasAll = entries.filter(
  (e) => e.hito && e.mono && e.gainen && e.w1k
).length

console.log(`=== Completion ===`)
console.log(
  `人: ${hasHito}  物: ${hasMono}  概念: ${hasGainen}  w1k: ${hasW1k}  all: ${hasAll} / ${entries.length}`
)

// --- category score ---
const catScores = entries.map((e) => ({ num: e.num, ...categoryScore(e) }))
const totalHito = catScores.reduce((s, e) => s + e.hitoCnt, 0)
const totalMono = catScores.reduce((s, e) => s + e.monoCnt, 0)
const totalGainen = catScores.reduce((s, e) => s + e.gainenCnt, 0)
const totalCatScore = catScores.reduce((s, e) => s + e.catScore, 0)

console.log('')
console.log(`=== Category Score ===`)
console.log(
  `人: ${totalHito}x8=${totalHito * 8}  物: ${totalMono}x10=${totalMono * 10}  概念: ${totalGainen}x4=${totalGainen * 4}  total: ${totalCatScore}`
)

// --- encode score ---
console.log('')
console.log(`=== Encode Score ===`)
console.log(`w1k: ${withW1.length}  errors: ${errors.length}`)

const scores = valid.map((e) => e.w1Score)
if (scores.length > 0) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  console.log(`avg: ${avg.toFixed(1)}  min: ${min}  max: ${max}`)
}

const lowScore = valid
  .filter((e) => e.w1Score < 30)
  .sort((a, b) => a.w1Score - b.w1Score)
if (lowScore.length > 0) {
  console.log('')
  console.log(`--- Low Score < 30 (${lowScore.length}) ---`)
  for (const e of lowScore) {
    console.log(`  ${e.num}: ${e.w1k} → ${e.w1Score}`)
  }
}
