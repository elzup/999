import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSheetTitleByGid, getSheetValuesByTitle } from './google-sheets.js'

const SHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const GID = '1530780723'
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=tsv&gid=${GID}`

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function parseTsvRows(tsv) {
  const lines = tsv.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) throw new Error('Empty TSV')
  const headers = lines[0].split('\t').map((header) => header.trim())
  const rows = lines
    .slice(1)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
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

/**
 * Google Sheet から TSV を取得。無認証 export を先に試し、非公開シートで
 * 弾かれたら認証 API に落ちる (sync-sheet.js / sync-tags.js と同じ二段構え)。
 */
async function fetchSheet() {
  const url = process.env.CARD_SHEET_URL_EXPORT || EXPORT_URL
  const res = await fetch(url)
  const text = res.ok ? await res.text() : ''

  if (res.ok && !text.startsWith('<!DOCTYPE')) return text

  console.log(
    `Public export unavailable (${res.status}), falling back to authenticated API...`
  )
  const title = await getSheetTitleByGid(SHEET_ID, GID)
  const values = await getSheetValuesByTitle({ spreadsheetId: SHEET_ID, title })
  return values.map((row) => row.join('\t')).join('\n')
}

function parseSheet(tsv) {
  const { headers, rows } = parseTsvRows(tsv)
  const indexMap = headerIndex(headers)

  const requiredHeaders = [
    'mark',
    'person',
    'action_p',
    'score_p',
    'object',
    'action_o',
    'score_o',
    'action',
    'score_a',
  ]
  const missing = requiredHeaders.filter((h) => !indexMap.has(h))
  if (missing.length > 0) {
    throw new Error(`想定しているヘッダが見つかりません: ${missing.join(', ')}`)
  }

  return rows
    .map((row) => {
      const mark = col(row, indexMap, 'mark')
      return {
        mark,
        person: col(row, indexMap, 'person'),
        action_p: col(row, indexMap, 'action_p'),
        score_p: normalizeScore(col(row, indexMap, 'score_p')),
        object: col(row, indexMap, 'object'),
        action_o: col(row, indexMap, 'action_o'),
        score_o: normalizeScore(col(row, indexMap, 'score_o')),
        action: col(row, indexMap, 'action'),
        score_a: normalizeScore(col(row, indexMap, 'score_a')),
      }
    })
    .filter((entry) => entry.mark)
}

function toTsv(entries) {
  const header =
    'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a'
  const rows = entries.map(
    (entry) =>
      `${entry.mark}\t${entry.person}\t${entry.action_p}\t${entry.score_p}\t${entry.object}\t${entry.action_o}\t${entry.score_o}\t${entry.action}\t${entry.score_a}`
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
    person: entries.filter((entry) => entry.person).length,
    action: entries.filter((entry) => entry.action).length,
    object: entries.filter((entry) => entry.object).length,
  }

  console.log(`  person: ${stats.person}/${entries.length}`)
  console.log(`  action: ${stats.action}/${entries.length}`)
  console.log(`  object: ${stats.object}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
