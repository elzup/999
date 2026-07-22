// 代表語(word-rep.json)から歌詞を生成する。
// 各番号 000-999 の代表①(order[0]) の読みを 1 つ取り、
// 4 読み/行・全角スペース区切りで並べる。100 番号ごとに 1 枚 → 全 10 枚。
// kuku の gen_lyrics.py と同じ体裁。
//
// 出力: lyrics/words_sheetNN.txt (00..09) と lyrics/words_all.txt
// 実行: node src/gen-words-lyrics.js

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import {
  availableSlots,
  loadRep,
  loadWordsTsv,
  resolveOrder,
} from './rep-store.js'

const ZW = '　' // 全角スペース
const PER_LINE = 4
const PER_SHEET = 100

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(repoRoot, 'lyrics')

/** 番号ごとの代表①の読みを返す(未確定でもデフォルト順で拾う) */
function repReading(word, entry) {
  const { order } = resolveOrder(word, entry)
  const slot = order[0]
  return slot ? word[`${slot}k`] || null : null
}

/** 自動確定(単一候補) or 明示確定 なら true */
function isConfirmed(word, entry) {
  return availableSlots(word).length <= 1 || Boolean(entry?.confirmed)
}

function toLines(readings) {
  const lines = []
  for (let i = 0; i < readings.length; i += PER_LINE) {
    lines.push(readings.slice(i, i + PER_LINE).join(ZW))
  }
  return lines
}

function main() {
  const rep = loadRep().rep || {}
  const words = loadWordsTsv().sort((a, b) => a.num.localeCompare(b.num))

  const readings = words.map((w) => repReading(w, rep[w.num]) || '＿')
  const confirmed = words.filter((w) => isConfirmed(w, rep[w.num])).length

  mkdirSync(outDir, { recursive: true })

  let allLines = []
  for (let s = 0; s < Math.ceil(words.length / PER_SHEET); s++) {
    const slice = readings.slice(s * PER_SHEET, (s + 1) * PER_SHEET)
    const from = String(s * PER_SHEET).padStart(3, '0')
    const to = String(s * PER_SHEET + slice.length - 1).padStart(3, '0')
    const lines = toLines(slice)
    const header = `# ${from}-${to} (${slice.length}語)`
    const body = lines.join('\n')
    const name = `words_sheet${String(s).padStart(2, '0')}.txt`
    writeFileSync(join(outDir, name), `${header}\n${body}\n`)
    allLines.push(header, body, '')
    console.log(`${name} : ${slice.length}語 / ${lines.length}行`)
  }

  writeFileSync(join(outDir, 'words_all.txt'), allLines.join('\n'))
  const missing = readings.filter((r) => r === '＿').length
  console.log(
    `\n合計 ${words.length}語 (確定 ${confirmed}) → lyrics/words_all.txt` +
      (missing ? ` ・ 読み欠落 ${missing}` : '')
  )
}

main()
