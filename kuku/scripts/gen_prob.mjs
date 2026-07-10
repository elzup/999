// kuku.json の各項目に「左辺(問題 AB×C)の読み」= prob を付与する派生スクリプト。
//   prob = ab_read(AB) + 'ん' + core[C]   (gen_readings.py の左辺部分と同一規則)
// 既存フィールド(yomi/expr/label/tier)は変更しない。追加のみ。冪等。
//
//   node kuku/scripts/gen_prob.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SINGLE_DIGIT, SINGLE_TIER, DOUBLE_DIGIT } from '../../src/table.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KUKU_JSON = join(ROOT, 'app/data/kuku.json')

// core[digit] = そのdigitの core かな (第一候補)
const core = {}
for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
  if (SINGLE_TIER[kana] === 'core' && core[digit] === undefined) core[digit] = kana
}

// doubleMatrix[a][b] = 2桁(10a+b)の読み候補 (登録順)
const doubleMatrix = Array.from({ length: 10 }, () =>
  Array.from({ length: 10 }, () => [])
)
for (const [kana, digits] of Object.entries(DOUBLE_DIGIT)) {
  const s = String(digits)
  if (s.length !== 2) continue
  const r = +s[0]
  const c = +s[1]
  if (r >= 0 && r <= 9 && c >= 0 && c <= 9) doubleMatrix[r][c].push(kana)
}

function abRead(AB) {
  const a = Math.floor(AB / 10)
  const b = AB % 10
  const cell = doubleMatrix[a][b]
  return cell.length > 0 ? cell[0] : core[a] + core[b]
}

// prob = 左辺の読み (〇〇ん〇 / 〇ん〇)
function probRead(AB, C) {
  return abRead(AB) + 'ん' + core[C]
}

const items = JSON.parse(readFileSync(KUKU_JSON, 'utf-8'))
for (const it of items) {
  const [ab, rest] = it.expr.split('x')
  const c = rest.split('=')[0]
  it.prob = probRead(Number(ab), Number(c))
}

writeFileSync(KUKU_JSON, JSON.stringify(items))
console.log(`updated ${items.length} items -> ${KUKU_JSON}`)
console.log('samples:', items.slice(0, 3).map((x) => `${x.expr} ${x.prob}`))
const s444 = items.find((x) => x.expr.startsWith('44x4='))
console.log('44x4:', s444 && s444.prob)
