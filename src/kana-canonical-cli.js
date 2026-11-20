// nr kana:canonical [--apply]
//
// よみを «1 つの読み方に 1 通りの書き方» (docs/kana-notation.md) に揃える。規則は kana-canonical.js。
//   half    番号に合わない 2 桁かなを半指定 (カタカナ) に   みつる → みツる
//   middle  自動で中間省略になっていたよみ                 さばんな → さば(ん)な
//   restore よみから消してある途中のかなを戻す             ブロック / ぶろく → ぶろ(っ)く
//   youon4  拗音 4 字の自動省略                            じょんき → じょ(ん)き
//   kata    カタカナを普通に読んでいるよみ                 パソ → ぱそ
// かなを書き換えた語の代表 (rep.picks) と評価 (ratings) の k も付け替える。
//
// 書くのは DB (Firestore numbers/*) だけ (D-0091)。シートは Function sheetSync が反映する。
// 既定は dry-run (差分を出すだけ)。--apply で書く。
//
// 認証: FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//       (GCLOUD_ACCOUNT があればそのアカウント。999 は個人アカウント)
import { execFileSync } from 'node:child_process'
import { connectRest } from './firestore/rest.js'
import { writeNumber } from './firestore/write.js'
import { canonicalizeDoc } from './kana-canonical.js'

const PROJECT_ID = 'anoz-memosupo'
const SOURCE = 'console'
const APPLY = process.argv.slice(2).includes('--apply')

const KIND_LABELS = {
  half: '番号に合わない 2 桁かなを半指定 (カタカナ) に',
  middle: '自動で中間省略になっていたよみ',
  restore: 'よみから消してある途中のかなを戻す',
  youon4: '拗音 4 字の自動省略',
  kata: 'カタカナを普通に読んでいるよみ',
}

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
      const result = canonicalizeDoc({ ...doc, num: doc.num ?? num })
      return result ? [{ num, current: doc, ...result }] : []
    })
}

const countRekeyed = (before, after) =>
  (after ?? []).filter((entry, i) => before?.[i] && before[i].k !== entry.k)
    .length

function printPlan(plan) {
  const changes = plan.flatMap(({ num, changes }) =>
    changes.map((c) => ({ num, ...c }))
  )
  console.log(`DB: ${plan.length} 番号 / ${changes.length} スロット`)
  for (const [kind, label] of Object.entries(KIND_LABELS)) {
    const list = changes.filter((c) => c.kinds.includes(kind))
    console.log(`  ${kind} ${label}: ${list.length} 個`)
    for (const c of list) {
      console.log(`    ${c.num} ${c.slot} ${c.word}: ${c.from} → ${c.to}`)
    }
  }
  const picks = plan.reduce(
    (sum, p) => sum + countRekeyed(p.current.rep?.picks, p.next.rep?.picks),
    0
  )
  const ratings = plan.reduce(
    (sum, p) => sum + countRekeyed(p.current.ratings, p.next.ratings),
    0
  )
  console.log(`\n付け替え: 代表 ${picks} 件 / 評価 ${ratings} 件`)
}

async function applyDb(db, plan) {
  const now = new Date().toISOString()
  const failed = []
  for (const { num, current, next } of plan) {
    const doc = { ...next, updatedAt: now, source: SOURCE }
    delete doc.derived // サーバ所有。writeNumber が付け直す
    const result = await writeNumber(db, {
      num,
      doc,
      expectedUpdatedAt: current.updatedAt ?? null,
      intent: ['slots', 'rep', 'ratings'],
    })
    if (result?.error) failed.push(`${num}: ${JSON.stringify(result)}`)
  }
  return failed
}

async function main() {
  const db = connectRest({ projectId: PROJECT_ID, token: firestoreToken() })
  const plan = await planDb(db)
  printPlan(plan)
  if (!APPLY) {
    console.log('\n(dry-run。--apply で書き込む)')
    return
  }
  const failed = await applyDb(db, plan)
  if (failed.length > 0) {
    throw new Error(`書き込みに失敗した番号:\n${failed.join('\n')}`)
  }
  console.log(
    `\n書き込み完了 (${plan.length} 番号)。シートへは sheetSync が反映する (nr sheet:status で確認)`
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
