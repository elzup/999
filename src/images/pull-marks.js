// web 版の画像コンソールで付けた印 (Firestore の imageMarks) を手元へ取り込む (D-0073)。
//   nr images:pull-marks           印を word-images-keep.json / word-images-redo.json へ写して消す
//   nr images:pull-marks --redo    続けて撮り直しの印が付いた枠を取り直す
// Mac が落ちているあいだに web で付けた印を、起きたときにまとめて片付けるためのもの。
// 認証は他の Firestore CLI と同じ (src/firestore/db.js の connect)。

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from '../firestore/db.js'
import { MARKS_COLLECTION, overlayMarks } from './marks.js'
import { PATHS, loadKeep, loadRedo, writeJson } from './store.js'
import { kindOf } from './targets.js'
import { redoDirect } from './direct.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function pullMarks(store) {
  const snap = await store.collection(MARKS_COLLECTION).get()
  if (snap.empty) return 0
  const keep = loadKeep()
  const redo = loadRedo()
  const next = overlayMarks(
    { keep: keep.keep, redo: redo.redo },
    snap.docs.map((d) => d.data())
  )
  // 手元へ書けてから消す。逆にすると、書き込みに失敗したとき印が消えたままになる
  writeJson(PATHS.keep, { ...keep, keep: next.keep })
  writeJson(PATHS.redo, { ...redo, redo: next.redo })
  // 読んだ後に web で付け直された印は消さない (更新時刻が変わっていれば delete が失敗する)
  const results = await Promise.allSettled(
    snap.docs.map((d) => d.ref.delete({ lastUpdateTime: d.updateTime }))
  )
  const kept = results.filter((r) => r.status === 'rejected').length
  if (kept > 0)
    console.log(`  ${kept} 件は取り込み中に web で付け直されたので次回に回す`)
  return snap.size
}

function run(script, args) {
  const r = spawnSync('node', [join('src', script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error(`${script} が exit ${r.status}`)
}

/** 番号は一括の検索 → 取得に通す。日付・カードはスクリプトが拾わないので 1 枠ずつ */
async function redoFlagged() {
  run('search-word-images.js', ['--redo'])
  run('fetch-word-images.js', ['--redo-only'])
  const others = Object.keys(loadRedo().redo).filter(
    (key) => kindOf(key.split(':')[0]) !== 'num'
  )
  for (const key of others) {
    const [id, slot] = key.split(':')
    const result = await redoDirect({ id, slot })
    if (!result.ok) {
      console.error(`  ${key}: ${result.error}`)
      continue
    }
    const redo = loadRedo()
    const { [key]: _done, ...rest } = redo.redo
    writeJson(PATHS.redo, { ...redo, redo: rest })
  }
}

async function main() {
  const db = connect()
  const count = await pullMarks(db.raw)
  console.log(`imageMarks: ${count} 件を取り込んだ`)
  const flagged = Object.keys(loadRedo().redo).length
  console.log(`撮り直しの印: ${flagged} 件`)
  if (process.argv.includes('--redo') && flagged > 0) await redoFlagged()
}

main().catch((error) => {
  console.error('pull-marks', error)
  process.exitCode = 1
})
