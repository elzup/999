import { writeFileSync } from 'node:fs'
import {
  SINGLE_DIGIT,
  SINGLE_TIER,
  DOUBLE_DIGIT,
  LONG_DIGIT,
} from '/Users/hiro/.ghq/github.com/elzup/999/src/table.js'

const singleByDigit = {}
for (let d = 0; d <= 9; d++) singleByDigit[d] = { core: [], sub: [], bad: [] }
for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
  const t = SINGLE_TIER[kana]
  if (t && singleByDigit[digit]?.[t]) singleByDigit[digit][t].push(kana)
}
const buildMatrix = (m) => {
  const mx = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [])
  )
  for (const [kana, digits] of Object.entries(m)) {
    if (String(digits).length !== 2) continue
    const r = +String(digits)[0]
    const c = +String(digits)[1]
    if (r >= 0 && r <= 9 && c >= 0 && c <= 9) mx[r][c].push(kana)
  }
  return mx
}
const out = {
  singleByDigit,
  doubleMatrix: buildMatrix(DOUBLE_DIGIT),
  longMatrix: buildMatrix(LONG_DIGIT),
}
const SC =
  '/private/tmp/claude-501/-Users-hiro--ghq-github-com-elzup-999/3ad69a3a-f482-40ec-ab35-c64cdef125ae/scratchpad'
writeFileSync(SC + '/rules.json', JSON.stringify(out))
console.log(
  'core:',
  JSON.stringify(
    Object.fromEntries([...Array(10)].map((_, d) => [d, singleByDigit[d].core[0]]))
  )
)
console.log('12->', out.doubleMatrix[1][2], '56->', out.doubleMatrix[5][6], '24->', out.doubleMatrix[2][4])
