import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
const tsv = readFileSync(join(dataDir, 'cards.tsv'), 'utf8')
const lines = tsv.split('\n').slice(1).filter((l) => l.trim())

const suits = ['S', 'H', 'C', 'D']
const grouped = {}
for (const suit of suits) {
  grouped[suit] = lines
    .filter((l) => l.startsWith(suit + '\t'))
    .map((l) => {
      const cols = l.split('\t')
      return {
        hitoYomi: cols[3] || '',
        dousaYomi: cols[5] || '',
        monoYomi: cols[7] || '',
        hito2Yomi: cols[9] || '',
        alt2Yomi: cols[11] || '',
      }
    })
}

/**
 * スプシ貼り付け用に出力
 * セパレータ行(スート間)は空行として挿入
 */
function buildColumn(field) {
  const rows = []
  for (let si = 0; si < suits.length; si++) {
    if (si > 0) rows.push('') // セパレータ行
    for (const entry of grouped[suits[si]]) {
      rows.push(entry[field])
    }
  }
  return rows.join('\n')
}

const columns = [
  { field: 'hitoYomi', col: 'C', label: '人読み' },
  { field: 'dousaYomi', col: 'F', label: '動作読み' },
  { field: 'monoYomi', col: 'I', label: '物読み' },
  { field: 'hito2Yomi', col: 'M', label: '人2読み' },
  { field: 'alt2Yomi', col: 'P', label: 'alt2読み' },
]

for (const { field, col, label } of columns) {
  console.log(`\n===== ${label} (列${col} : ${col}3 から貼り付け) =====`)
  console.log(buildColumn(field))
}
