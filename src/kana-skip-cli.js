// nr kana:skip [--apply]
//
// 読まないかなを記法 ( ) で書き直す。規則は kana-skip-migrate.js。3 種類ある。
//   restore 語と突き合わせて、よみから消してあるかなを戻す   サバンナ / さばな → さば(ん)な
//   middle  自動で中間省略になっていたよみ                     さばんな → さば(ん)な
//   tail    3 桁を超えて読まない語尾                           にいさん → にいさ(ん)
// どれも読み方 (読む数字) を変えない置き換えだけを書く。
//
// シートの 999 タブのかなの列と、DB の numbers/* のスロットのかなを同じ規則で書き換える。
// 日付 (1231 タブ) は 4 桁で rankey の対象外なので触らない。
// 既定は dry-run (差分を出すだけ)。--apply で DB → シートの順に書く (label:n と同じ順)。
// --apply ではシートのかなを書く前に、999 / 1231 タブの check 列の式を正本 (sheet-layout.js) で
// 書き直す。古い式は記法 ( ) を知らないので、さば(ん)な を «かなが不正» と出してしまう。
// 書き終えたら nr sync でローカルの words.tsv も取り直すこと。
//
// 認証:
//   DB    FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//         (GCLOUD_ACCOUNT があればそのアカウント)
//   シート google-sheets.js の既定 (GOOGLE_SERVICE_ACCOUNT_PATH など)
import { execFileSync } from 'node:child_process'
import { connectRest } from './firestore/rest.js'
import { writeNumber } from './firestore/write.js'
import { batchUpdateValues, getSheetValuesByTitle } from './google-sheets.js'
import {
  migrateKanaSkipInDoc,
  migrateKanaSkipInSheet,
} from './kana-skip-migrate.js'
import { MAIN_LAYOUT, checkColumnUpdates } from './sheet-layout.js'

const PROJECT_ID = 'anoz-memosupo'
const SPREADSHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const SHEET_TAB = '999'
/** check 列の式を書き直すタブ (どちらも MAIN_LAYOUT) */
const FORMULA_TABS = ['999', '1231']
const SOURCE = 'console'

const APPLY = process.argv.slice(2).includes('--apply')

function firestoreToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) {
    return process.env.FIRESTORE_ACCESS_TOKEN
  }
  const account = process.env.GCLOUD_ACCOUNT
  const gcloudArgs = ['auth', 'print-access-token']
  if (account) gcloudArgs.push(`--account=${account}`)
  return execFileSync('gcloud', gcloudArgs).toString().trim()
}

async function planDb(db) {
  const docs = await db.readAllNumbers()
  return Object.entries(docs)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([num, doc]) => {
      const result = migrateKanaSkipInDoc({ ...doc, num: doc.num ?? num })
      return result ? [{ num, current: doc, ...result }] : []
    })
}

async function planSheet() {
  const values = await getSheetValuesByTitle({
    spreadsheetId: SPREADSHEET_ID,
    title: SHEET_TAB,
  })
  return migrateKanaSkipInSheet(values)
}

const KIND_LABELS = {
  restore: 'よみから消してあるかなを戻す (語と突き合わせ)',
  middle: '自動で中間省略になっていたよみ',
  tail: '3 桁を超えて読まない語尾',
}

function printPlan(dbPlan, sheetPlan) {
  const changes = dbPlan.flatMap(({ num, changes }) =>
    changes.map((c) => ({ num, ...c }))
  )
  console.log(`DB: ${dbPlan.length} 番号 / ${changes.length} スロット`)
  for (const [kind, label] of Object.entries(KIND_LABELS)) {
    const list = changes.filter((c) => c.kind === kind)
    console.log(`  ${kind} ${label}: ${list.length} 個`)
    for (const c of list) {
      console.log(`    ${c.num} ${c.slot} ${c.word}: ${c.from} → ${c.to}`)
    }
  }
  console.log(`\nシート ${SHEET_TAB}: ${sheetPlan.length} セル`)
  for (const { cell, num, slot, kind, before, after } of sheetPlan) {
    console.log(`  ${cell} (${num} ${slot} ${kind}): ${before} → ${after}`)
  }
  // DB とシートが揃っていれば同じ枠が並ぶ。片方にしか無い枠は、同期待ちか手で直した跡
  const dbKeys = new Set(changes.map((c) => `${c.num}:${c.slot}`))
  const sheetKeys = new Set(sheetPlan.map((c) => `${c.num}:${c.slot}`))
  const onlyDb = [...dbKeys].filter((k) => !sheetKeys.has(k))
  const onlySheet = [...sheetKeys].filter((k) => !dbKeys.has(k))
  if (onlyDb.length || onlySheet.length) {
    console.log(
      `\n片方にしか無い枠 (DB だけ ${onlyDb.length} / シートだけ ${onlySheet.length}):`
    )
    for (const k of onlyDb) console.log(`  DB だけ    ${k}`)
    for (const k of onlySheet) console.log(`  シートだけ ${k}`)
  }
}

async function applyDb(db, dbPlan) {
  const now = new Date().toISOString()
  const failed = []
  for (const { num, current, next } of dbPlan) {
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

/** check 列の式を正本で書き直す (記法 ( ) を通す式にする) */
async function applyCheckFormulas() {
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

async function applySheet(sheetPlan) {
  const data = sheetPlan.map(({ cell, after }) => ({
    range: `'${SHEET_TAB}'!${cell}`,
    values: [[after]],
  }))
  if (data.length === 0) return
  await batchUpdateValues({ spreadsheetId: SPREADSHEET_ID, data })
}

async function main() {
  const db = connectRest({ projectId: PROJECT_ID, token: firestoreToken() })
  const dbPlan = await planDb(db)
  const sheetPlan = await planSheet()
  printPlan(dbPlan, sheetPlan)

  if (!APPLY) {
    console.log('\n(dry-run。--apply で書き込む)')
    return
  }
  const failed = await applyDb(db, dbPlan)
  if (failed.length > 0) {
    // DB が揃わないままシートだけ変えると、次の同期でシートの古いかなが DB へ戻りうる
    throw new Error(
      `DB の書き込みに失敗 (シートは未変更):\n${failed.join('\n')}`
    )
  }
  await applyCheckFormulas()
  await applySheet(sheetPlan)
  console.log('\n書き込み完了。nr sync でローカルの words.tsv を取り直すこと')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
