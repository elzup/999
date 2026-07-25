// FF シート(00-FF=256行)から歌詞を生成する。読み規則は src/ff-reading.js が正本。
//   代表読み: NC/CN = hex名前読み + 括弧内かな / NN/CC = 語読み(F括弧内 or G/H)
//   歌詞読み: hex名前読みの前半を付けない語だけの読み (lyricReading)
//   4読み/行・全角スペース区切り
// 出力: lyrics/ff_nn-cc.txt, ff_nc-cn.txt (代表読み・2分割)
//       lyrics/ff_nc-cn-cc.txt (歌詞読み・NC/CN/CC を 3 ブロック)
// 実行: node scripts/gen-ff-lyrics.mjs  (認証 SA 自動使用)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFfRows } from './ff-sheet.mjs'
import {
  clean,
  lyricReading,
  rowReading,
  validateFfRows,
} from '../src/ff-reading.js'

const ZW = '　' // 全角スペース
const PER_LINE = 4
const GROUPS = [
  { key: 'nn-cc', label: 'NN+CC', types: new Set(['NN', 'CC']) },
  { key: 'nc-cn', label: 'NC+CN', types: new Set(['NC', 'CN']) },
]
const BLOCK_FILE = { key: 'nc-cn-cc', types: ['NC', 'CN', 'CC'] }
const PENDING = '＿' // CN のアルファベット読み語が未定
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lyrics')

const toLines = (arr) => {
  const lines = []
  for (let i = 0; i < arr.length; i += PER_LINE)
    lines.push(arr.slice(i, i + PER_LINE).join(ZW))
  return lines
}

/**
 * 1x(NC) と Bx(CN) は展開が必ず一致するため参照語が同じになる。
 * 数字展開の語は NC 優先で保持し、CN 側は「ビー…」のアルファベット読み語を
 * 新たに当てる方針なので、未着手の重複は未定として空ける。
 */
function resolveCnCollision(items) {
  const ncReadings = new Set(
    items.filter((it) => it.type === 'NC').map((it) => it.lyric)
  )
  const pending = []
  const resolved = items.map((it) => {
    if (it.type !== 'CN' || !ncReadings.has(it.lyric)) return it
    pending.push({ hex: it.hex, taken: it.lyric })
    return { ...it, lyric: PENDING }
  })
  return { resolved, pending }
}

/** タイプ別に 1 ファイルへ 3 ブロック(# TYPE ヘッダ区切り)で書き出す */
function writeBlocks(items) {
  const blocks = BLOCK_FILE.types.map((type) => {
    const readings = items
      .filter((it) => it.type === type)
      .map((it) => it.lyric)
    return { type, readings, lines: toLines(readings) }
  })
  const body = blocks
    .map((b) => `# ${b.type} (${b.readings.length}語)\n${b.lines.join('\n')}`)
    .join('\n\n')
  writeFileSync(join(outDir, `ff_${BLOCK_FILE.key}.txt`), `${body}\n`)
  const total = blocks.reduce((n, b) => n + b.readings.length, 0)
  const lines = blocks.reduce((n, b) => n + b.lines.length, 0)
  console.log(
    `ff_${BLOCK_FILE.key}.txt : ${blocks
      .map((b) => `${b.type} ${b.readings.length}語`)
      .join(' / ')} = ${total}語 / ${lines}行`
  )
}

async function main() {
  const rows = await readFfRows()
  const items = validateFfRows(rows).map((r) => ({
    hex: clean(r[1]),
    type: clean(r[2]),
    reading: rowReading(r),
    lyric: lyricReading(r),
  }))
  const { resolved, pending } = resolveCnCollision(items)

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
  writeBlocks(resolved)
  if (pending.length) {
    console.log(
      `\nCN 未定 ${pending.length}件 (NC と重複・アルファベット読み語で要補充):`
    )
    pending.forEach((p) =>
      console.log(`  ${p.hex} : NC が「${p.taken}」を保持`)
    )
  }
  console.log(`\n合計 ${items.length}語`)
}

main().catch((err) => {
  console.error(String(err.message || err).slice(0, 300))
  process.exit(1)
})
