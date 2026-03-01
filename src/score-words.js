import { loadWords, scoreEntry } from './words.js'

const entries = loadWords()
const scored = entries.map(scoreEntry)

const withW1 = scored.filter((e) => e.w1k)
const errors = withW1.filter((e) => e.w1Error)
const valid = withW1.filter((e) => !e.w1Error)

console.log(`=== Score Summary ===`)
console.log(`Total: ${entries.length}  w1k: ${withW1.length}  errors: ${errors.length}`)

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
