// nr label:n [--apply]
//
// ラベル -n (馴染みがない) を主観評価 -1 に移し、語 (タイトル) からは外す。
// 規則は label-n-migrate.js。シートの 999 タブの 人・物 セルと、DB の numbers/*
// (語・確定時の語・代表・評価) を同じ規則で書き換える。
// 既定は dry-run (差分を出すだけ)。--apply で DB → シートの順に書く。
//
// - 評価がまだ無い語には -1 を付ける。既に評価がある語はその評価を残す
// - かなの無い枠・一覧の 4 番目以降の語は評価の移し先が無いので -n を残し、一覧に出す
// - 1231 (日付) タブは評価を持たないので触らない
//
// DB を先に書くのは tag:rename と同じ理由 (シート → DB の同期は語が変わったスロットの
// 画像・評価を引き継がない)。書き終えたら nr sync でローカルの words.tsv も取り直すこと。
//
// 認証:
//   DB    FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//         (GCLOUD_ACCOUNT があればそのアカウント)
//   シート google-sheets.js の既定 (GOOGLE_SERVICE_ACCOUNT_PATH など)
import { execFileSync } from 'node:child_process'
import { connectRest } from './firestore/rest.js'
import { writeNumber } from './firestore/write.js'
import { columnsOf } from './firestore/sheet-io.js'
import { batchUpdateValues, getSheetValuesByTitle } from './google-sheets.js'
import { migrateLabelNInDoc, migrateLabelNInSheet } from './label-n-migrate.js'

const PROJECT_ID = 'anoz-memosupo'
const SPREADSHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const SHEET_TAB = '999'
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
  const writes = []
  const remaining = []
  for (const [num, doc] of Object.entries(docs).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const result = migrateLabelNInDoc(doc)
    if (!result) continue
    if (result.next) {
      writes.push({ num, current: doc, next: result.next, moves: result.moves })
    }
    for (const word of result.remaining) remaining.push({ num, word })
  }
  return { writes, remaining }
}

async function planSheet() {
  const values = await getSheetValuesByTitle({
    spreadsheetId: SPREADSHEET_ID,
    title: SHEET_TAB,
  })
  return migrateLabelNInSheet(values, columnsOf(values[0] ?? []))
}

function printPlan(dbPlan, sheetPlan) {
  const moves = dbPlan.writes.flatMap(({ num, moves }) =>
    moves.map((move) => ({ num, ...move }))
  )
  const added = moves.filter((m) => !m.kept).length
  console.log(
    `DB: ${dbPlan.writes.length} 件 (語 ${moves.length} 個。評価 -1 を新しく付ける ${added} / 既存の評価を残す ${moves.length - added})`
  )
  for (const m of moves) {
    const rating = m.kept
      ? `評価 ${m.rating} のまま`
      : `評価 ${m.rating} を付ける`
    console.log(`  ${m.num} ${m.slot} ${m.k}: ${m.from} → ${m.to} (${rating})`)
  }
  console.log(`\nシート ${SHEET_TAB}: ${sheetPlan.changes.length} セル`)
  for (const { cell, num, before, after } of sheetPlan.changes) {
    console.log(`  ${cell} (${num}): ${before} → ${after}`)
  }
  const remaining = [...dbPlan.remaining, ...sheetPlan.remaining]
  const unique = [...new Set(remaining.map((r) => `${r.num} ${r.word}`))]
  console.log(
    `\n-n を残す語 (かなの無い枠・4 番目以降。評価の移し先が無い): ${unique.length} 個`
  )
  for (const line of unique) console.log(`  ${line}`)
}

async function applyDb(db, writes) {
  const now = new Date().toISOString()
  const failed = []
  for (const { num, current, next } of writes) {
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

async function applySheet(changes) {
  if (changes.length === 0) return
  await batchUpdateValues({
    spreadsheetId: SPREADSHEET_ID,
    data: changes.map(({ cell, after }) => ({
      range: `'${SHEET_TAB}'!${cell}`,
      values: [[after]],
    })),
  })
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
  const failed = await applyDb(db, dbPlan.writes)
  if (failed.length > 0) {
    // DB が揃わないままシートだけ変えると評価との対応が外れるので、シートは書かない
    throw new Error(
      `DB の書き込みに失敗 (シートは未変更):\n${failed.join('\n')}`
    )
  }
  await applySheet(sheetPlan.changes)
  console.log('\n書き込み完了。nr sync でローカルの words.tsv を取り直すこと')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
