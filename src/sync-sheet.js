import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitConceptFields } from './words.js'
import { isDateKey4 } from './date-keys.js'
import { writeWordsMeta } from './words-cache-meta.js'
import { SLOT_KEYS } from './sheet-layout.js'
import {
  getSheetTitleByGid,
  getSheetValuesByTitle,
  parseSpreadsheetUrl,
} from './google-sheets.js'

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM/edit?gid=0#gid=0'

const SLOT_SUFFIXES = ['', 'k', 'Img']

/** スロットごとの列 (語 / かな / 画像)。並びは words.tsv の見出し順 */
const SLOT_TSV_FIELDS = SLOT_KEYS.flatMap((slot) =>
  SLOT_SUFFIXES.map((suffix) => slot + suffix)
)

// 2 スロット時代 (w1 = 人, w2 = 物) の見出し。古いシートの書き出しも読めるように残す
const LEGACY_HEADERS = {
  wh1: ['w1'],
  wh1k: ['w1k'],
  wh1Img: ['w1Img'],
  wh2: ['w1_2'],
  wh2Img: ['w1_2Img'],
  wm1: ['w2'],
  wm1k: ['w2k'],
  wm1Img: ['w2Img'],
  wm2: ['w2_2'],
  wm2Img: ['w2_2Img'],
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function buildExportUrl(sheetUrl) {
  const { spreadsheetId, gid } = parseSpreadsheetUrl(sheetUrl)
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv&gid=${gid}`
}

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
  // SHEET_URL は他タブ向けなので、sync 専用 URL を使う
  const sheetUrl = process.env.SHEET_URL_SYNC || DEFAULT_SHEET_URL
  const exportUrl = process.env.SHEET_URL_EXPORT || buildExportUrl(sheetUrl)

  try {
    const res = await fetch(exportUrl)
    if (res.ok) {
      const text = await res.text()
      if (!text.startsWith('<!DOCTYPE')) {
        return text
      }
    }
  } catch (err) {
    // 公開 export が使えない場合は認証 API にフォールバック
  }

  console.log('Public export unavailable, falling back to authenticated API...')
  const { spreadsheetId, gid } = parseSpreadsheetUrl(sheetUrl)
  const title = await getSheetTitleByGid(spreadsheetId, gid)
  const values = await getSheetValuesByTitle({ spreadsheetId, title })
  return values.map((row) => row.join('\t')).join('\n')
}

function parseTsv(tsv) {
  const lines = tsv.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('Empty TSV')

  const { index } = parseHeader(lines[0])

  const numIdx = index['num'] ?? 0
  const hitoIdx = pickIndex(index, ['hito', '人'])
  const monoIdx = pickIndex(index, ['mono', '物'])
  const gainenIdx = pickIndex(index, ['gainen', '概念'])
  const slotIdx = slotColumnIndexes(index)

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const num = cols[numIdx]?.trim()
    // 3桁 = num 辞書、4桁 = 日付 (10〜12月) 辞書。それ以外は行として扱わない
    if (!num || !(/^\d{3}$/.test(num) || isDateKey4(num))) continue

    const hito = cols[hitoIdx]?.trim() || ''
    const monoRaw = cols[monoIdx]?.trim() || ''
    const gainenRaw = cols[gainenIdx]?.trim() || ''
    const { mono, gainen } = splitConceptFields(monoRaw, gainenRaw)
    entries.push({
      num,
      hito,
      mono,
      gainen,
      ...Object.fromEntries(
        slotIdx.map(([field, idx]) => [field, cols[idx]?.trim() || ''])
      ),
    })
  }

  return entries
}

/** 各スロット列が TSV の何列目か。昔の見出し名でも引けるようにする */
function slotColumnIndexes(index) {
  return SLOT_TSV_FIELDS.map((field) => [
    field,
    pickIndex(index, [field, ...(LEGACY_HEADERS[field] ?? [])]),
  ])
}

function pickIndex(index, names) {
  for (const name of names) {
    if (index[name] !== undefined) return index[name]
  }
  return undefined
}

function toTsv(entries) {
  const header = ['num', 'hito', 'mono', ...SLOT_TSV_FIELDS]
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
  const all = parseTsv(tsv)
  // 4桁の日付行は words.tsv に混ぜない (下流は 3 桁前提のものが多い)
  const entries = all.filter((e) => e.num.length === 3)
  const dates = all.filter((e) => e.num.length === 4)

  const outPath = join(dataDir, 'words.tsv')
  writeFileSync(outPath, toTsv(entries))
  console.log(`Saved ${entries.length} entries to ${outPath}`)
  const meta = writeWordsMeta(entries)
  console.log(`  content updated at: ${meta.contentUpdatedAt}`)

  const datesPath = join(dataDir, 'dates.tsv')
  writeFileSync(datesPath, toTsv(dates))
  console.log(`Saved ${dates.length} date entries to ${datesPath}`)

  const filled = entries.filter((e) => e.wh1k)
  console.log(`  wh1k filled: ${filled.length}/${entries.length}`)
  const filled2 = entries.filter((e) => e.wm1k)
  console.log(`  wm1k filled: ${filled2.length}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
