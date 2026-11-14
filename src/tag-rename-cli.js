// nr tag:rename <旧タグ> <新タグ> [--apply]
//
// タグを 1 つの名前に寄せる (#スプラ → #splatoon など)。シートの 999 / 1231 タブの
// 人・物 セルと、DB の numbers/* (語・タグ別の画像・代表・評価) を同じ規則で置き換える。
// 既定は dry-run (差分を出すだけ)。--apply で DB → シートの順に書く。
//
// DB を先に書くのは、シートの同期 (sheet → DB) が «語が変わったスロット» の画像を
// 引き継がないため。シートを先に変えると、間に同期が走ったとき画像との対応が外れる。
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
  isValidTagName,
  renameTagInDoc,
  renameTagInSheet,
} from './tag-rename.js'

const PROJECT_ID = 'anoz-memosupo'
const SPREADSHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
/** 語を書いているタブ (番号 / 日付) */
const SHEET_TABS = ['999', '1231']
const SOURCE = 'console'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const [from, to] = args.filter((arg) => !arg.startsWith('--'))

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
      const next = renameTagInDoc(doc, from, to)
      return next ? [{ num, current: doc, next }] : []
    })
}

async function planSheet() {
  const tabs = []
  for (const title of SHEET_TABS) {
    const values = await getSheetValuesByTitle({
      spreadsheetId: SPREADSHEET_ID,
      title,
    })
    tabs.push({ title, changes: renameTagInSheet(values, from, to) })
  }
  return tabs
}

function printPlan(dbPlan, sheetPlan) {
  console.log(`#${from} → #${to}`)
  console.log(`\nDB: ${dbPlan.length} 件`)
  for (const { num, current, next } of dbPlan) {
    for (const [slot, value] of Object.entries(next.slots ?? {})) {
      const before = current.slots?.[slot]
      if (JSON.stringify(before) !== JSON.stringify(value)) {
        console.log(`  ${num} ${slot}: ${before?.word} → ${value.word}`)
      }
    }
    const picks = (doc) =>
      (doc.rep?.picks ?? []).map((pick) => pick.w).join(', ')
    if (picks(current) !== picks(next)) {
      console.log(`  ${num} 代表: ${picks(current)} → ${picks(next)}`)
    }
  }
  for (const { title, changes } of sheetPlan) {
    console.log(`\nシート ${title}: ${changes.length} セル`)
    for (const { cell, before, after } of changes) {
      console.log(`  ${cell}: ${before} → ${after}`)
    }
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
      intent: ['slots', 'rep', 'ratings'],
    })
    if (result?.error) failed.push(`${num}: ${result.error}`)
  }
  return failed
}

async function applySheet(sheetPlan) {
  const data = sheetPlan.flatMap(({ title, changes }) =>
    changes.map(({ cell, after }) => ({
      range: `'${title}'!${cell}`,
      values: [[after]],
    }))
  )
  if (data.length === 0) return
  await batchUpdateValues({ spreadsheetId: SPREADSHEET_ID, data })
}

async function main() {
  if (!isValidTagName(from) || !isValidTagName(to) || from === to) {
    throw new Error(
      '使い方: nr tag:rename <旧タグ> <新タグ> [--apply] (# は付けない。空白・#・カンマ不可)'
    )
  }
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
    // DB が揃わないままシートだけ変えると対応が外れるので、シートは書かない
    throw new Error(
      `DB の書き込みに失敗 (シートは未変更):\n${failed.join('\n')}`
    )
  }
  await applySheet(sheetPlan)
  console.log('\n書き込み完了。nr sync でローカルの words.tsv を取り直すこと')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
