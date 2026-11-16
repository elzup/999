// 日付・カードの画像が未取得の枠を一巡して取得する (番号は images:search → images:fetch)。
//   node src/fetch-target-images.js --kind card [--dry-run]
// 取得済みの枠は触らない。差し替えは console で 1 枠ずつ行う。

import { parseArgs } from 'node:util'
import { loadManifest } from './images/store.js'
import { IMAGE_KINDS } from './images/targets.js'
import { loadTargets, redoDirect } from './images/direct.js'

const { values } = parseArgs({
  options: {
    kind: { type: 'string', default: 'card' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const kind = values.kind
if (!IMAGE_KINDS[kind]) {
  throw new Error(`--kind は num / date / card のどれか: ${kind}`)
}
// 番号の旧スロットは一括パイプライン (search/fetch スクリプト) が受け持つ。
// ここで取るのは、そのパイプラインが知らないタグ違いの枠 (w1_2#res など) だけ
const isOurs = (slot) => kind !== 'num' || slot.includes('#')

const images = loadManifest().images || {}
const jobs = loadTargets()
  .filter((t) => t.kind === kind)
  .flatMap((t) =>
    t.slots
      .filter((slot) => isOurs(slot) && t[slot] && !images[t.id]?.[slot])
      .map((slot) => ({ id: t.id, slot, word: t[slot] }))
  )

console.log(`${IMAGE_KINDS[kind].label}: 未取得 ${jobs.length} 枠`)
if (values['dry-run']) {
  for (const job of jobs) console.log(`  ${job.id}:${job.slot} ${job.word}`)
  process.exit(0)
}

let failed = 0
// 検索 API の連打を避けて 1 枠ずつ順に取る
for (const job of jobs) {
  const result = await redoDirect(job)
  if (result.ok) {
    console.log(`  ${job.id}:${job.slot} ${job.word} -> ok`)
  } else {
    failed++
    console.log(`  ${job.id}:${job.slot} ${job.word} -> ${result.error}`)
  }
}
console.log(`完了: 成功 ${jobs.length - failed} / 失敗 ${failed}`)
