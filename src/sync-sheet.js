import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitConceptFields } from './words.js'

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
  const hitoIdx = pickIndex(index, ['hito', '人'])
  const monoIdx = pickIndex(index, ['mono', '物'])
  const gainenIdx = pickIndex(index, ['gainen', '概念'])
  const wh1Idx = pickIndex(index, ['wh1', 'w1'])
  const wh1kIdx = pickIndex(index, ['wh1k', 'w1k'])
  const wh1ImgIdx = pickIndex(index, ['wh1Img', 'w1Img'])
  const wh2Idx = pickIndex(index, ['wh2', 'w1_2'])
  const wh2kIdx = pickIndex(index, ['wh2k'])
  const wh2ImgIdx = pickIndex(index, ['wh2Img', 'w1_2Img'])
  const wh3Idx = pickIndex(index, ['wh3'])
  const wh3kIdx = pickIndex(index, ['wh3k'])
  const wh3ImgIdx = pickIndex(index, ['wh3Img'])
  const wm1Idx = pickIndex(index, ['wm1', 'w2'])
  const wm1kIdx = pickIndex(index, ['wm1k', 'w2k'])
  const wm1ImgIdx = pickIndex(index, ['wm1Img', 'w2Img'])
  const wm2Idx = pickIndex(index, ['wm2', 'w2_2'])
  const wm2kIdx = pickIndex(index, ['wm2k'])
  const wm2ImgIdx = pickIndex(index, ['wm2Img', 'w2_2Img'])
  const wm3Idx = pickIndex(index, ['wm3'])
  const wm3kIdx = pickIndex(index, ['wm3k'])
  const wm3ImgIdx = pickIndex(index, ['wm3Img'])

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const num = cols[numIdx]?.trim()
    if (!num || !/^\d{3}$/.test(num)) continue

    const hito = cols[hitoIdx]?.trim() || ''
    const monoRaw = cols[monoIdx]?.trim() || ''
    const gainenRaw = cols[gainenIdx]?.trim() || ''
    const { mono, gainen } = splitConceptFields(monoRaw, gainenRaw)
    const wh1 = cols[wh1Idx]?.trim() || ''
    const wh1k = cols[wh1kIdx]?.trim() || ''
    const wh1Img = cols[wh1ImgIdx]?.trim() || ''
    const wh2 = cols[wh2Idx]?.trim() || ''
    const wh2k = cols[wh2kIdx]?.trim() || ''
    const wh2Img = cols[wh2ImgIdx]?.trim() || ''
    const wh3 = cols[wh3Idx]?.trim() || ''
    const wh3k = cols[wh3kIdx]?.trim() || ''
    const wh3Img = cols[wh3ImgIdx]?.trim() || ''
    const wm1 = cols[wm1Idx]?.trim() || ''
    const wm1k = cols[wm1kIdx]?.trim() || ''
    const wm1Img = cols[wm1ImgIdx]?.trim() || ''
    const wm2 = cols[wm2Idx]?.trim() || ''
    const wm2k = cols[wm2kIdx]?.trim() || ''
    const wm2Img = cols[wm2ImgIdx]?.trim() || ''
    const wm3 = cols[wm3Idx]?.trim() || ''
    const wm3k = cols[wm3kIdx]?.trim() || ''
    const wm3Img = cols[wm3ImgIdx]?.trim() || ''

    entries.push({
      num,
      hito,
      mono,
      gainen,
      wh1,
      wh1k,
      wh1Img,
      wh2,
      wh2k,
      wh2Img,
      wh3,
      wh3k,
      wh3Img,
      wm1,
      wm1k,
      wm1Img,
      wm2,
      wm2k,
      wm2Img,
      wm3,
      wm3k,
      wm3Img,
    })
  }

  return entries
}

function pickIndex(index, names) {
  for (const name of names) {
    if (index[name] !== undefined) return index[name]
  }
  return undefined
}

function toTsv(entries) {
  const header = [
    'num',
    'hito',
    'mono',
    'wh1',
    'wh1k',
    'wh1Img',
    'wh2',
    'wh2k',
    'wh2Img',
    'wh3',
    'wh3k',
    'wh3Img',
    'wm1',
    'wm1k',
    'wm1Img',
    'wm2',
    'wm2k',
    'wm2Img',
    'wm3',
    'wm3k',
    'wm3Img',
  ]
  const rows = entries.map((e) =>
    header
      .map((key) => (e[key] === undefined || e[key] === null ? '' : e[key]))
      .join('\t')
  )
  return [header.join('\t'), ...rows].join('\n') + '\n'
}

async function main() {
  console.log('Fetching sheet...')
  const tsv = await fetchSheet()

  console.log('Parsing...')
  const entries = parseTsv(tsv)

  const outPath = join(dataDir, 'words.tsv')
  writeFileSync(outPath, toTsv(entries))
  console.log(`Saved ${entries.length} entries to ${outPath}`)

  const filled = entries.filter((e) => e.wh1k)
  console.log(`  wh1k filled: ${filled.length}/${entries.length}`)
  const filled2 = entries.filter((e) => e.wm1k)
  console.log(`  wm1k filled: ${filled2.length}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
