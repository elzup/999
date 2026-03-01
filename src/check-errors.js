import { loadWords, scoreEntry } from './words.js'

const entries = loadWords()
const scored = entries.map(scoreEntry)

const w1Errors = scored.filter((e) => e.w1Error)
const w2Errors = scored.filter((e) => e.w2Error)

console.log(`=== Encode Errors (w1: ${w1Errors.length}, w2: ${w2Errors.length}) ===`)
for (const e of w1Errors) {
  console.log(`  ${e.num} w1: ${e.w1k}`)
}
for (const e of w2Errors) {
  console.log(`  ${e.num} w2: ${e.w2k}`)
}
