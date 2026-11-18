// nr label:n [--apply]
//
// ラベル -n (馴染みがない) を主観評価 -1 に移し、語 (タイトル) からはすべて外す。
// ラベル -x (語呂強引) は語に残したまま評価 -1 を付け、-n より強く削除候補に挙げる。
// 規則は label-n-migrate.js。シートの 999 / 1231 タブの 人・物 セルと、DB の numbers/*
// (語・確定時の語・代表・評価) を同じ規則で書き換える。
// 既定は dry-run (差分を出すだけ)。--apply で DB → シートの順に書く。
//
// - かなのある語で評価がまだ無いものには -1 を付ける。既に評価がある語はその評価を残す
// - かなの無い枠・一覧の 4 番目以降の語は評価の移し先が無いので、-n を外すだけ
// - 同じ番号に有力な別の語 (評価 +1 以上 / 代表) がある -n の語は削除検討候補として
//   一覧に出し、src/label-n.out.json にも書く。語そのものは消さない (人が判断する)
// - -x の語は、同じ番号に別の語 (-x が無く評価 -1 でもない語) が 1 つでもあれば候補。
//   評価が 0 以上の -x の語は «ラベルと評価が食い違う» として別に出す
//
// DB を先に書くのは tag:rename と同じ理由 (シート → DB の同期は語が変わったスロットの
// 画像・評価を引き継がない)。書き終えたら nr sync でローカルの words.tsv も取り直すこと。
//
// 認証:
//   DB    FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//         (GCLOUD_ACCOUNT があればそのアカウント)
//   シート google-sheets.js の既定 (GOOGLE_SERVICE_ACCOUNT_PATH など)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectRest } from './firestore/rest.js'
import { writeNumber } from './firestore/write.js'
import { batchUpdateValues, getSheetValuesByTitle } from './google-sheets.js'
import { migrateLabelNInDoc, migrateLabelNInSheet } from './label-n-migrate.js'

const PROJECT_ID = 'anoz-memosupo'
const SPREADSHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
/** 語を書いているタブ (番号 / 日付) */
const SHEET_TABS = ['999', '1231']
const SOURCE = 'console'
/** 削除検討候補の書き出し先 (gitignore 済み。語は私的データ) */
const REPORT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'label-n.out.json'
)

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
      const result = migrateLabelNInDoc(doc)
      return result ? [{ num, current: doc, ...result }] : []
    })
}

async function planSheet() {
  const tabs = []
  for (const title of SHEET_TABS) {
    const values = await getSheetValuesByTitle({
      spreadsheetId: SPREADSHEET_ID,
      title,
    })
    tabs.push({ title, changes: migrateLabelNInSheet(values) })
  }
  return tabs
}

function candidatesOf(dbPlan) {
  return dbPlan.flatMap(({ num, candidates }) =>
    candidates.map((c) => ({ num, ...c }))
  )
}

const MAX_RIVALS = 4

function printPlan(dbPlan, sheetPlan) {
  const writes = dbPlan.filter((p) => p.next)
  const moves = writes.flatMap(({ num, moves }) =>
    moves.filter((m) => !m.kept).map((move) => ({ num, ...move }))
  )
  const kept = writes.flatMap(({ num, moves }) =>
    moves
      .filter((m) => m.kept && m.from !== m.to)
      .map((move) => ({ num, ...move }))
  )
  const unrated = dbPlan.flatMap(({ num, unrated }) =>
    unrated.map((u) => ({ num, ...u }))
  )
  console.log(`DB: ${writes.length} 件`)
  console.log(`  評価 -1 を新しく付ける語 ${moves.length} 個`)
  for (const m of moves) {
    console.log(
      `    ${m.num} ${m.slot} -${m.label} ${m.k}: ${m.from} → ${m.to}`
    )
  }
  console.log(`  -n を外し、既存の評価を残す語 ${kept.length} 個`)
  for (const m of kept) {
    console.log(
      `    ${m.num} ${m.slot} ${m.k}: ${m.from} → ${m.to} (評価 ${m.rating})`
    )
  }
  console.log(
    `  評価を付けられない語 (かな無し・4 番目以降。-n は外す / -x は残す) ${unrated.length} 個`
  )
  for (const u of unrated) {
    console.log(`    ${u.num} ${u.side} -${u.label}: ${u.word}`)
  }

  for (const { title, changes } of sheetPlan) {
    console.log(`\nシート ${title}: ${changes.length} セル`)
    for (const { cell, before, after } of changes) {
      console.log(`  ${cell}: ${before} → ${after}`)
    }
  }

  const conflicts = dbPlan.flatMap(({ num, conflicts }) =>
    conflicts.map((c) => ({ num, ...c }))
  )
  console.log(
    `\n-x なのに評価が 0 以上の語 (評価は残す): ${conflicts.length} 個`
  )
  for (const c of conflicts) {
    console.log(`  ${c.num} ${c.k}: ${c.word} (評価 ${c.rating})`)
  }

  const candidates = candidatesOf(dbPlan)
  console.log(`\n削除検討候補: ${candidates.length} 個`)
  for (const label of ['x', 'n']) {
    const list = candidates.filter((c) => c.label === label)
    console.log(
      label === 'x'
        ? `  -x (同じ番号に別の語がある): ${list.length} 個`
        : `  -n (同じ番号に有力な別の語がある): ${list.length} 個`
    )
    for (const c of list) {
      const rating = c.rating === null ? '評価なし' : `評価 ${c.rating}`
      const rivals = c.rivals.slice(0, MAX_RIVALS).join(', ')
      const more =
        c.rivals.length > MAX_RIVALS
          ? ` 他 ${c.rivals.length - MAX_RIVALS}`
          : ''
      console.log(`    ${c.num} ${c.word} (${rating}) ← ${rivals}${more}`)
    }
  }
}

async function applyDb(db, dbPlan) {
  const now = new Date().toISOString()
  const failed = []
  for (const { num, current, next } of dbPlan) {
    if (!next) continue // 候補を出すだけで書き換えの要らない番号
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
  const db = connectRest({ projectId: PROJECT_ID, token: firestoreToken() })
  const dbPlan = await planDb(db)
  const sheetPlan = await planSheet()
  printPlan(dbPlan, sheetPlan)
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        candidates: candidatesOf(dbPlan),
        conflicts: dbPlan.flatMap(({ num, conflicts }) =>
          conflicts.map((c) => ({ num, ...c }))
        ),
      },
      null,
      2
    ) + '\n'
  )
  console.log(`\n削除検討候補を ${REPORT_PATH} に書いた`)

  if (!APPLY) {
    console.log('\n(dry-run。--apply で書き込む)')
    return
  }
  const failed = await applyDb(db, dbPlan)
  if (failed.length > 0) {
    // DB が揃わないままシートだけ変えると評価との対応が外れるので、シートは書かない
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
