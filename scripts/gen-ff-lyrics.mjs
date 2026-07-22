// FF シート(00-FF=256行)から歌詞を生成する。読み規則は src/ff-reading.js が正本。
//   NC/CN = hex名前読み + 括弧内かな / NN/CC = 語読み(F括弧内 or G/H)
//   4読み/行・全角スペース区切り、タイプで二分割(NN+CC / NC+CN)
// 出力: lyrics/ff_nn-cc.txt, ff_nc-cn.txt
// 実行: node scripts/gen-ff-lyrics.mjs  (認証 SA 自動使用)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFfRows } from './ff-sheet.mjs'
import { clean, rowReading, validateFfRows } from '../src/ff-reading.js'

const ZW = '　' // 全角スペース
const PER_LINE = 4
const GROUPS = [
  { key: 'nn-cc', label: 'NN+CC', types: new Set(['NN', 'CC']) },
  { key: 'nc-cn', label: 'NC+CN', types: new Set(['NC', 'CN']) },
]
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lyrics')

const toLines = (arr) => {
  const lines = []
  for (let i = 0; i < arr.length; i += PER_LINE)
    lines.push(arr.slice(i, i + PER_LINE).join(ZW))
  return lines
}

async function main() {
  const rows = await readFfRows()
  const items = validateFfRows(rows).map((r) => ({
    type: clean(r[2]),
    reading: rowReading(r),
  }))

  mkdirSync(outDir, { recursive: true })
  for (const g of GROUPS) {
    const readings = items
      .filter((it) => g.types.has(it.type))
      .map((it) => it.reading)
    const header = `# ${g.label} (${readings.length}語)`
    writeFileSync(
      join(outDir, `ff_${g.key}.txt`),
      `${header}\n${toLines(readings).join('\n')}\n`
    )
    console.log(
      `ff_${g.key}.txt : ${g.label} ${readings.length}語 / ${
        toLines(readings).length
      }行`
    )
  }
  console.log(`\n合計 ${items.length}語`)
}

main().catch((err) => {
  console.error(String(err.message || err).slice(0, 300))
  process.exit(1)
})
