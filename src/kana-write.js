// よみの書き換えを DB → シートの順に書く共通部分 (nr kana:skip / nr kana:long)。
// DB が揃わないままシートだけ変えると、次の同期でシートの古いかなが DB へ戻りうるので、必ず DB を先に書く。
//
// 認証:
//   DB    FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//         (GCLOUD_ACCOUNT があればそのアカウント)
//   シート google-sheets.js の既定 (GOOGLE_SERVICE_ACCOUNT_PATH など)
import { execFileSync } from 'node:child_process'
import { connectRest } from './firestore/rest.js'
import { writeNumber } from './firestore/write.js'
import { batchUpdateValues, getSheetValuesByTitle } from './google-sheets.js'
import { MAIN_LAYOUT, checkColumnUpdates } from './sheet-layout.js'

export const PROJECT_ID = 'anoz-memosupo'
export const SPREADSHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
export const SHEET_TAB = '999'
/** check 列の式を書き直すタブ (どちらも MAIN_LAYOUT) */
const FORMULA_TABS = ['999', '1231']
const SOURCE = 'console'

function firestoreToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) {
    return process.env.FIRESTORE_ACCESS_TOKEN
  }
  const account = process.env.GCLOUD_ACCOUNT
  const gcloudArgs = ['auth', 'print-access-token']
  if (account) gcloudArgs.push(`--account=${account}`)
  return execFileSync('gcloud', gcloudArgs).toString().trim()
}

export const connectDb = () =>
  connectRest({ projectId: PROJECT_ID, token: firestoreToken() })

export const readMainSheet = () =>
  getSheetValuesByTitle({ spreadsheetId: SPREADSHEET_ID, title: SHEET_TAB })

/**
 * 番号文書を書く。plan は {num, current, next} の列 (current は読んだときの文書)
 * @returns {Promise<string[]>} 失敗した番号とエラー
 */
export async function applyDb(db, plan) {
  const now = new Date().toISOString()
  const failed = []
  for (const { num, current, next } of plan) {
    const doc = { ...next, updatedAt: now, source: SOURCE }
    delete doc.derived // サーバ所有。writeNumber が付け直す
    const result = await writeNumber(db, {
      num,
      doc,
      expectedUpdatedAt: current.updatedAt ?? null,
      intent: ['slots'],
    })
    if (result?.error) failed.push(`${num}: ${result.error}`)
  }
  return failed
}

/**
 * check 列の式を正本で書き直す (記法 (半角カナ) を通す式にする)。
 * 古い式は記法を知らないので、さばﾝな を «かなが不正» と出してしまう
 */
export async function applyCheckFormulas() {
  const data = []
  for (const title of FORMULA_TABS) {
    const values = await getSheetValuesByTitle({
      spreadsheetId: SPREADSHEET_ID,
      title,
    })
    if (values.length < 2) continue
    data.push(...checkColumnUpdates(title, MAIN_LAYOUT, values.length))
  }
  await batchUpdateValues({
    spreadsheetId: SPREADSHEET_ID,
    data,
    valueInputOption: 'USER_ENTERED',
  })
  console.log(`check 列の式を書き直した (${FORMULA_TABS.join(' / ')} タブ)`)
}

/** 999 タブのセルを書く。cells は {cell: 'AB12', after} の列 */
export async function applySheet(cells) {
  const data = cells.map(({ cell, after }) => ({
    range: `'${SHEET_TAB}'!${cell}`,
    values: [[after]],
  }))
  if (data.length === 0) return
  await batchUpdateValues({ spreadsheetId: SPREADSHEET_ID, data })
}

/** DB → check 列の式 → シートの順に書く。DB が 1 件でも失敗したらシートは触らない */
export async function writeDbThenSheet(db, dbPlan, sheetCells) {
  const failed = await applyDb(db, dbPlan)
  if (failed.length > 0) {
    throw new Error(
      `DB の書き込みに失敗 (シートは未変更):\n${failed.join('\n')}`
    )
  }
  await applyCheckFormulas()
  await applySheet(sheetCells)
}
