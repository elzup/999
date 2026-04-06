import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const GID = '1530780723'
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=tsv&gid=${GID}`

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function parseTsvRows(tsv) {
  const lines = tsv.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) throw new Error('Empty TSV')
  const headers = lines[0].split('\t').map((header) => header.trim())
  const rows = lines.slice(1).map((line) => line.split('\t').map((cell) => cell.trim()))
  return { headers, rows }
}

function headerIndex(headers) {
  const map = new Map()
  headers.forEach((header, index) => {
    if (!map.has(header)) map.set(header, index)
  })
  return map
}

function col(row, indexMap, name) {
  return row[indexMap.get(name) ?? -1] ?? ''
}

function normalizeScore(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return ''
  return String(Math.max(0, Math.min(3, value)))
}

/** Google Sheet から TSV を取得 */
async function fetchSheet() {
  const url = process.env.CARD_SHEET_URL_EXPORT || EXPORT_URL
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

function parseSheet(tsv) {
  const { headers, rows } = parseTsvRows(tsv)
  const indexMap = headerIndex(headers)

  const hasModernHeaders =
    indexMap.has('mark') &&
    indexMap.has('first') &&
    indexMap.has('score') &&
    (indexMap.has('secondary(flip)') || indexMap.has('secondary'))

  if (!hasModernHeaders) {
    throw new Error(
      '想定しているヘッダ mark / first / score / secondary(flip) が見つかりません'
    )
  }

  return rows
    .map((row) => ({
      mark: col(row, indexMap, 'mark'),
      first: col(row, indexMap, 'first'),
      score: normalizeScore(col(row, indexMap, 'score')),
      secondary: col(row, indexMap, 'secondary(flip)') || col(row, indexMap, 'secondary'),
    }))
    .filter((entry) => entry.mark)
}

function toTsv(entries) {
  const header = 'mark\tfirst\tscore\tsecondary(flip)'
  const rows = entries.map(
    (entry) => `${entry.mark}\t${entry.first}\t${entry.score}\t${entry.secondary}`
  )
  return [header, ...rows].join('\n') + '\n'
}

async function main() {
  console.log('Fetching card sheet...')
  const tsv = await fetchSheet()

  console.log('Parsing...')
  const entries = parseSheet(tsv)

  const outPath = join(dataDir, 'cards.tsv')
  writeFileSync(outPath, toTsv(entries))
  console.log(`Saved ${entries.length} card entries to ${outPath}`)

  const stats = {
    first: entries.filter((entry) => entry.first).length,
    score: entries.filter((entry) => entry.score !== '').length,
    secondary: entries.filter((entry) => entry.secondary).length,
  }

  console.log(`  first: ${stats.first}/${entries.length}`)
  console.log(`  score: ${stats.score}/${entries.length}`)
  console.log(`  secondary: ${stats.secondary}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
