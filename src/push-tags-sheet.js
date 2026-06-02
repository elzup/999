import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getSheetValuesByTitle,
  overwriteSheetValuesByTitle,
  parseSpreadsheetUrl,
} from './google-sheets.js'

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM/edit?gid=0#gid=0'
const TAG_SHEET_TITLE = 'tags'
const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
const WORDS_TSV_PATH = join(dataDir, 'words.tsv')
const TAG_RE = /#([^\s#,]+)/g

function showHelp() {
  console.log(`Usage: npm run push:tags

src/data/words.tsv から BCD 列 (hito / mono / gainen) の #tag を集計し、
スプレッドシート内の "${TAG_SHEET_TITLE}" シートへ一覧を書き込みます。

B 列 (title) は複数人が手で編集する列なので、既存シートの値を
tag ごとに読み取って引き継ぎます (新規 tag は空欄)。

認証:
  - 推奨: gcloud auth application-default login
  - または service account JSON を使う

service account を使う場合:
  1. Google Cloud で service account を作成
  2. その JSON キーを .config/google-service-account.json に保存
  3. その service account の email を対象スプレッドシートに編集者として共有

任意の環境変数:
  GOOGLE_SERVICE_ACCOUNT_PATH
  GOOGLE_SERVICE_ACCOUNT_JSON
  GOOGLE_APPLICATION_CREDENTIALS
  SHEET_URL
  TAG_SHEET_TITLE
`)
}

function parseTsv(tsv) {
  const lines = tsv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')

  if (lines.length === 0) throw new Error(`${WORDS_TSV_PATH} が空です`)

  const headers = lines[0].split('\t').map((cell) => cell.trim())
  return lines.slice(1).map((line) => {
    const cols = line.split('\t')
    const entry = {}
    headers.forEach((key, index) => {
      entry[key] = cols[index]?.trim() || ''
    })
    return entry
  })
}

function parseTaggedItems(raw) {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const tags = [...label.matchAll(TAG_RE)].map((match) => match[1])
      const uniqueTags = [...new Set(tags)]
      const base = label.replace(TAG_RE, '').trim()
      return { label, base, tags: uniqueTags }
    })
}

function collectTags(entries) {
  const map = new Map()

  for (const entry of entries) {
    const fields = [
      ['hito', entry.hito],
      ['mono', entry.mono],
      ['gainen', entry.gainen],
    ]

    for (const [category, raw] of fields) {
      for (const item of parseTaggedItems(raw)) {
        for (const tag of item.tags) {
          const current = map.get(tag) || {
            tag,
            count: 0,
            hito: 0,
            mono: 0,
            gainen: 0,
            nums: new Set(),
            labels: [],
          }

          current.count += 1
          current[category] += 1
          current.nums.add(entry.num)
          current.labels.push(`${entry.num}:${category}:${item.label}`)
          map.set(tag, current)
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.tag.localeCompare(b.tag, 'ja')
  })
}

// B 列 (title) は手動メンテ列。既存シートから tag -> title を読み取り引き継ぐ。
function buildTitleMap(existingValues) {
  const map = new Map()
  if (!existingValues || existingValues.length === 0) return map

  const header = existingValues[0].map((cell) => String(cell).trim())
  const tagIndex = header.indexOf('tag')
  const titleIndex = header.indexOf('title')
  if (tagIndex === -1 || titleIndex === -1) return map

  for (const row of existingValues.slice(1)) {
    const tag = String(row[tagIndex] ?? '').trim()
    const title = String(row[titleIndex] ?? '').trim()
    if (tag) map.set(tag, title)
  }
  return map
}

function buildValues(rows, titleMap) {
  const header = [
    'tag',
    'title',
    'count',
    'hito',
    'mono',
    'gainen',
    'nums',
    'labels',
  ]
  return [
    header,
    ...rows.map((row) => [
      row.tag,
      titleMap.get(row.tag) || '',
      String(row.count),
      String(row.hito),
      String(row.mono),
      String(row.gainen),
      [...row.nums].sort().join(','),
      row.labels.join('\n'),
    ]),
  ]
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp()
    return
  }

  const sheetUrl = process.env.SHEET_URL || SHEET_URL
  const title = process.env.TAG_SHEET_TITLE || TAG_SHEET_TITLE
  const { spreadsheetId } = parseSpreadsheetUrl(sheetUrl)

  const entries = parseTsv(readFileSync(WORDS_TSV_PATH, 'utf8'))
  const tags = collectTags(entries)

  // 書き込み前に既存の手動 title 列を読み取り保護する
  const existingValues = await getSheetValuesByTitle({
    spreadsheetId,
    title,
  }).catch(() => [])
  const titleMap = buildTitleMap(existingValues)
  const values = buildValues(tags, titleMap)

  console.log(
    `Uploading ${tags.length} tags to sheet "${title}" (preserving ${titleMap.size} titles)...`
  )
  const result = await overwriteSheetValuesByTitle({
    spreadsheetId,
    title,
    values,
  })
  console.log(
    `Updated "${result.title}" (${result.rows} rows x ${result.cols} cols)`
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
