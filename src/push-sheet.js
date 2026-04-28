import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { overwriteSheetValues, parseSpreadsheetUrl } from './google-sheets.js'

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM/edit?gid=0#gid=0'
const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
const WORDS_TSV_PATH = join(dataDir, 'words.tsv')

function showHelp() {
  console.log(`Usage: npm run push

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
`)
}

function parseTsv(tsv) {
  return tsv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'))
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp()
    return
  }

  const sheetUrl = process.env.SHEET_URL || SHEET_URL
  const { spreadsheetId, gid } = parseSpreadsheetUrl(sheetUrl)
  if (!gid) {
    throw new Error('SHEET_URL に gid が必要です')
  }

  const values = parseTsv(readFileSync(WORDS_TSV_PATH, 'utf8'))
  if (values.length === 0) {
    throw new Error(`${WORDS_TSV_PATH} が空です`)
  }

  console.log(`Uploading ${values.length - 1} rows to sheet gid=${gid}...`)
  const result = await overwriteSheetValues({ spreadsheetId, gid, values })
  console.log(
    `Updated "${result.title}" (${result.rows} rows x ${result.cols} cols)`
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
