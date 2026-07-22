// FF シート(00-FF=256行)を app 同梱用 JSON に落とす。
//   app/data/ff.json = [{hex,type,bin,exp,word,kana,read}, ...] (num 0..255 順)
// 読み規則は src/ff-reading.js が正本(歌詞と共通)。
// 実行: node scripts/gen-ff-json.mjs  (認証 SA 自動使用)

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFfRows } from './ff-sheet.mjs'
import { buildRow, validateFfRows } from '../src/ff-reading.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(repoRoot, 'app', 'data', 'ff.json')

async function main() {
  const rows = await readFfRows()
  const items = validateFfRows(rows).map(buildRow)
  writeFileSync(OUT, JSON.stringify(items) + '\n')
  const byType = {}
  for (const it of items) byType[it.type] = (byType[it.type] || 0) + 1
  console.log(
    `wrote ${items.length} -> app/data/ff.json`,
    JSON.stringify(byType)
  )
  console.log(
    'samples:',
    items
      .slice(0, 3)
      .map((i) => `${i.hex}:${i.read}`)
      .join('  ')
  )
  const b3 = items.find((i) => i.hex === 'B3')
  console.log('B3 =', JSON.stringify(b3))
}

main().catch((err) => {
  console.error(String(err.message || err).slice(0, 300))
  process.exit(1)
})
