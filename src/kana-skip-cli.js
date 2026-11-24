// nr kana:skip [--apply]
//
// 読まないかなを記法 (半角カナ) で書き直す。規則は kana-skip-migrate.js。3 種類ある。
//   restore 語と突き合わせて、よみから消してあるかなを戻す   サバンナ / さばな → さばﾝな
//   middle  自動で中間省略になっていたよみ                     さばんな → さばﾝな
//   tail    3 桁を超えて読まない語尾                           にいさん → にいさﾝ
// どれも読み方 (読む数字) を変えない置き換えだけを書く。
//
// シートの 999 タブのかなの列と、DB の numbers/* のスロットのかなを同じ規則で書き換える。
// 日付 (1231 タブ) は 4 桁で rankey の対象外なので触らない。
// 既定は dry-run (差分を出すだけ)。--apply で DB → シートの順に書く (label:n と同じ順)。
// --apply ではシートのかなを書く前に、999 / 1231 タブの check 列の式を正本 (sheet-layout.js) で
// 書き直す。古い式は記法 (半角カナ) を知らないので、さばﾝな を «かなが不正» と出してしまう。
// 書き終えたら nr sync でローカルの words.tsv も取り直すこと。
//
// 認証と書く順は kana-write.js。
import {
  SHEET_TAB,
  connectDb,
  readMainSheet,
  writeDbThenSheet,
} from './kana-write.js'
import {
  migrateKanaSkipInDoc,
  migrateKanaSkipInSheet,
} from './kana-skip-migrate.js'

const APPLY = process.argv.slice(2).includes('--apply')

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
  return migrateKanaSkipInSheet(await readMainSheet())
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

async function main() {
  const db = connectDb()
  const dbPlan = await planDb(db)
  const sheetPlan = await planSheet()
  printPlan(dbPlan, sheetPlan)

  if (!APPLY) {
    console.log('\n(dry-run。--apply で書き込む)')
    return
  }
  await writeDbThenSheet(db, dbPlan, sheetPlan)
  console.log('\n書き込み完了。nr sync でローカルの words.tsv を取り直すこと')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
