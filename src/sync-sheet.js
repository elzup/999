import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const GID = '0'
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=tsv&gid=${GID}`

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

/** TSV 行をパースしてヘッダーインデックスを取得 */
function parseHeader(headerLine) {
  const cols = headerLine.split('\t')
  const index = {}
  cols.forEach((col, i) => {
    if (index[col] === undefined) {
      index[col] = i
    } else {
      index[col + '2'] = i
    }
  })
  return { cols, index }
}

/** Google Sheet から TSV を取得してパース */
async function fetchSheet() {
  const url = process.env.SHEET_URL_EXPORT || EXPORT_URL
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`)
  }

  const text = await res.text()

  if (text.startsWith('<!DOCTYPE')) {
    throw new Error(
      'シートが非公開です。共有設定を「リンクを知っている全員」に変更してください'
    )
  }

  return text
}

function parseTsv(tsv) {
  const lines = tsv.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('Empty TSV')

  const { index } = parseHeader(lines[0])

  const numIdx = index['num'] ?? 0
  const hitoIdx = index['人']
  const monoIdx = index['物']
  const gainenIdx = index['概念']
  const w1Idx = index['w1']
  const w1kIdx = index['w1k']
  const w2Idx = index['w2']
  const w2kIdx = index['w2k']

  if (w1kIdx === undefined) {
    throw new Error('w1k column not found in header')
  }

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const num = cols[numIdx]?.trim()
    if (!num || !/^\d{3}$/.test(num)) continue

    const hito = cols[hitoIdx]?.trim() || ''
    const mono = cols[monoIdx]?.trim() || ''
    const gainen = cols[gainenIdx]?.trim() || ''
    const w1 = cols[w1Idx]?.trim() || ''
    const w1k = cols[w1kIdx]?.trim() || ''
    const w2 = cols[w2Idx]?.trim() || ''
    const w2k = cols[w2kIdx]?.trim() || ''

    // 2枠目の穴埋め用: 片方が空のとき、もう一方の2項目目を派生させる
    // w2(モノ)が空 -> 人の2人目を w1_2 へ / w1(人)が空 -> モノの2つ目を w2_2 へ
    const w1_2 = !w2 ? secondItem(hito, w1) : ''
    const w2_2 = !w1 ? secondItem(mono, w2) : ''

    entries.push({ num, hito, mono, gainen, w1, w1k, w2, w2k, w1_2, w2_2 })
  }

  return entries
}

/** col のカンマ区切り項目から、w と異なる最初の項目 (通常2番目) を返す */
function secondItem(col, w) {
  const items = (col || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const rest = items.filter((it) => it !== w)
  return rest.length ? rest[0] : ''
}

function toTsv(entries) {
  const header = 'num\thito\tmono\tgainen\tw1\tw1k\tw2\tw2k\tw1_2\tw2_2'
  const rows = entries.map(
    (e) =>
      `${e.num}\t${e.hito}\t${e.mono}\t${e.gainen}\t${e.w1}\t${e.w1k}\t${
        e.w2
      }\t${e.w2k}\t${e.w1_2 || ''}\t${e.w2_2 || ''}`
  )
  return [header, ...rows].join('\n') + '\n'
}

async function main() {
  console.log('Fetching sheet...')
  const tsv = await fetchSheet()

  console.log('Parsing...')
  const entries = parseTsv(tsv)

  const outPath = join(dataDir, 'words.tsv')
  writeFileSync(outPath, toTsv(entries))
  console.log(`Saved ${entries.length} entries to ${outPath}`)

  const filled = entries.filter((e) => e.w1k)
  console.log(`  w1k filled: ${filled.length}/${entries.length}`)
  const filled2 = entries.filter((e) => e.w2k)
  console.log(`  w2k filled: ${filled2.length}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
