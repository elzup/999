import {
  loadWords,
  extractName,
  isKanaOnly,
  normalizeForCompare,
} from './words.js'

function isDefinitelyWrong(w, wk) {
  const name = extractName(w)
  if (!name || !wk) return null
  if (!isKanaOnly(name)) return null

  const normName = normalizeForCompare(name)
  const normWk = normalizeForCompare(wk)
  if (!normName || !normWk) return null
  if (normName[0] === normWk[0]) return null

  return { name, nameNorm: normName, wk, wkNorm: normWk }
}

const entries = loadWords()
const definiteErrors = []

for (const entry of entries) {
  const v1 = isDefinitelyWrong(entry.w1, entry.w1k)
  if (v1) definiteErrors.push({ num: entry.num, side: 'w1', ...v1, w: entry.w1 })
  const v2 = isDefinitelyWrong(entry.w2, entry.w2k)
  if (v2) definiteErrors.push({ num: entry.num, side: 'w2', ...v2, w: entry.w2 })
}

console.log(`=== Definite Kana Errors (${definiteErrors.length}) ===`)
for (const m of definiteErrors) {
  console.log(`  ${m.num} ${m.side}: ${m.w} → ${m.nameNorm} ≠ ${m.wk}`)
}
