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

    const w1 = cols[w1Idx]?.trim() || ''
    const w1k = cols[w1kIdx]?.trim() || ''
    const w2 = cols[w2Idx]?.trim() || ''
    const w2k = cols[w2kIdx]?.trim() || ''

    entries.push({ num, w1, w1k, w2, w2k })
  }

  return entries
}

function toTsv(entries) {
  const header = 'num\tw1\tw1k\tw2\tw2k'
  const rows = entries.map(
    (e) => `${e.num}\t${e.w1}\t${e.w1k}\t${e.w2}\t${e.w2k}`
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
