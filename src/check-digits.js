import { loadWords, scoreEntry } from './words.js'

const entries = loadWords()
const scored = entries.map(scoreEntry)

const valid = scored.filter((e) => e.w1k && !e.w1Error)
const mismatch = valid.filter((e) => e.w1Digits !== e.num)

console.log(`=== Digit Mismatch (${mismatch.length}/${valid.length}) ===`)
for (const e of mismatch) {
  console.log(`  ${e.num}: ${e.w1k} → ${e.w1Digits} (expected ${e.num})`)
}
