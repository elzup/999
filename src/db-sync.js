// シート -> Firestore の同期と、代表語の移行、チャンク再構築をまとめた CLI。
// spec: .vsdd/firestore-store/specs/spec-sheet-to-db-sync.md ほか
//
//   node src/db-sync.js              全部を dry-run (既定。書き込まない)
//   node src/db-sync.js --apply      実際に書き込む
//   node src/db-sync.js --only sync  sync | migrate | bundles を個別に
//
// 既定を dry-run にしているのは、この移行の目的が «失うと復元できないデータを
// 守ること» だから。書き込む前に必ず件数を目視できるようにする。

import { readFileSync } from 'node:fs'
import { availableSlots, loadWordsTsv, REP_PATH } from './rep-store.js'
import { buildAllBundles } from './firestore/bundles.js'
import { connect } from './firestore/db.js'
import { withDerived } from './firestore/derived.js'
import { planRepMigration, reconcile } from './firestore/rep-migration.js'
import { planSheetSync } from './firestore/sheet-to-db.js'
import { writeNumber } from './firestore/write.js'

const APPLY = process.argv.includes('--apply')
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? process.argv[i + 1] : null
})()
const wants = (step) => !only || only === step

const now = new Date().toISOString()
const log = (...args) => console.log(...args)

async function applyWrites(db, writes, label) {
  let done = 0
  const failed = []
  for (const write of writes) {
    const result = await writeNumber(db, write)
    if (result.ok) done++
    else failed.push({ num: write.num, ...result })
  }
  log(`  ${label}: 書込 ${done} 件 / 失敗 ${failed.length} 件`)
  for (const f of failed.slice(0, 10)) log(`    ${f.num}: ${f.error}`)
  return { done, failed }
}

async function main() {
  const db = connect()
  log(APPLY ? '=== 適用モード ===' : '=== dry-run (--apply で書き込み) ===')

  const existing = await db.readAllNumbers()
  log(`既存の numbers: ${Object.keys(existing).length} 件`)

  if (wants('sync')) {
    const rows = loadWordsTsv().filter((w) => availableSlots(w).length > 0)
    const plan = planSheetSync({ rows, existing, now, withDerived })
    log('\n[sync] シート -> DB')
    log(`  書込対象 ${plan.writes.length} / 変更なし ${plan.unchanged}`)
    log(`  無視 ${plan.ignored} / 保持 ${plan.kept.length}`)
    if (plan.conflicts.length) log(`  ⚠ 重複 num: ${plan.conflicts.join(' ')}`)
    if (plan.refused.length)
      log(`  ⚠ 保護違反で拒否: ${plan.refused.length} 件`)
    if (APPLY) await applyWrites(db, plan.writes, 'sync')
  }

  if (wants('migrate')) {
    const store = JSON.parse(readFileSync(REP_PATH, 'utf8'))
    const target = APPLY ? await db.readAllNumbers() : existing
    const plan = planRepMigration({ store, existing: target, now })
    const checked = reconcile(plan, store)
    log('\n[migrate] word-rep.json -> numbers')
    log(`  書込対象 ${plan.writes.length}`)
    log(
      `  既に値あり ${plan.blocked.length} / 移行先なし ${plan.missing.length}`
    )
    log(`  件数照合: ${checked.ok ? 'OK' : JSON.stringify(checked)}`)
    if (!checked.ok) {
      log('  照合に失敗したので移行を中止する')
    } else if (APPLY) {
      await applyWrites(db, plan.writes, 'migrate')
    }
  }

  if (wants('bundles')) {
    const docs = Object.values(APPLY ? await db.readAllNumbers() : existing)
    log('\n[bundles] 読み込み用チャンク再構築')
    if (docs.length === 0) {
      log('  numbers が空なのでチャンクは作らない')
    } else {
      const bundles = buildAllBundles(docs, { now })
      const max = Math.max(
        ...bundles.map((b) => Buffer.byteLength(JSON.stringify(b)))
      )
      log(`  ${bundles.length} 個 / 最大 ${(max / 1024).toFixed(0)} KB`)
      if (APPLY) log(`  書込 ${await db.writeChunks(bundles)} 個`)
    }
  }

  if (!APPLY) log('\n書き込んでいない。--apply で実行する')
}

/** よくある失敗を、次にやることが分かる形に言い換える */
function explain(error) {
  const message = String(error?.message ?? error)
  if (message.includes('Cloud Firestore API has not been used')) {
    return [
      'Firestore がまだ有効化されていない。',
      '',
      '  1. Firebase コンソールで Firestore データベースを作成する',
      '     https://console.firebase.google.com/project/anoz-memosupo/firestore',
      '  2. ロケーションは asia-northeast1 (Functions と同じ) を選ぶ',
      '     ※ ロケーションは後から変更できない',
      '  3. nr db:rules でセキュリティルールを反映する',
      '  4. nr db:plan で差分を確認してから nr db:push',
    ].join('\n')
  }
  if (message.includes('Could not load the default credentials')) {
    return [
      '認証情報が無い。次のどちらかを用意する。',
      '  - gcloud auth application-default login',
      '  - FIRESTORE_KEY=<service account json> を指定',
    ].join('\n')
  }
  return message
}

main().catch((error) => {
  console.error(explain(error))
  process.exit(1)
})
