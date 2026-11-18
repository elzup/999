// 撮り直しの印が付いた枠をまとめて取り直す。
//   nr images:redo-flagged
// web 版 console で付けた印も正本 (Firestore imageSlots) に直接入るので、withImageSync が
// 最初に取り込んでから流す。Mac が落ちているあいだに付けた印を、起きたときに片付けるためのもの。

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PATHS, loadRedo, writeJson } from './store.js'
import { PIPELINE_SLOTS, kindOf } from './targets.js'
import { redoDirect } from './direct.js'
import { withImageSync } from './image-sync.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function run(script, args) {
  const r = spawnSync('node', [join('src', script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error(`${script} が exit ${r.status}`)
}

/**
 * 番号の旧 4 枠は一括の検索 → 取得に通す。日付・カード、番号の 3 番目 (wh3 / wm3)、
 * タグ違いの枠 (w1_2#res) は一括スクリプトが知らないので 1 枠ずつ直接取る (server.js の redoNow と同じ)
 */
async function redoFlagged() {
  run('search-word-images.js', ['--redo'])
  run('fetch-word-images.js', ['--redo-only'])
  const others = Object.keys(loadRedo().redo).filter((key) => {
    const [id, slot] = key.split(':')
    return kindOf(id) !== 'num' || !PIPELINE_SLOTS.includes(slot)
  })
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
  const flagged = Object.keys(loadRedo().redo).length
  console.log(`撮り直しの印: ${flagged} 件`)
  if (flagged > 0) await redoFlagged()
}

withImageSync(main)
