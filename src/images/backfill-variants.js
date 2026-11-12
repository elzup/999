// 既存の原本 (words/<hash>.webp) に縮小版 (@96 / @240) を後から足す。
// 新しく上げる画像は uploadWebp が縮小版も一緒に上げるので、これは既存分の 1 回きり。
// 冪等: 揃っている原本は読まずに飛ばすので、途中で止めても再実行すれば続きから進む。
//
//   node src/images/backfill-variants.js           # 足りない縮小版を上げる
//   node src/images/backfill-variants.js --check   # 上げずに、足りない数だけ数える

import { VARIANT_SIZES, variantKey } from './process.js'
import {
  downloadObject,
  listAllKeys,
  listBaseKeys,
  uploadVariants,
} from './upload.js'

const CHECK_ONLY = process.argv.includes('--check')
// GCS への同時アップロード数。上げすぎると 429 が返る
const CONCURRENCY = 8

function missingKeys(baseKeys, existing) {
  return baseKeys.filter((key) =>
    VARIANT_SIZES.some((size) => !existing.has(variantKey(key, size)))
  )
}

async function runPool(items, worker) {
  let next = 0
  let failed = 0
  const runOne = async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await worker(item)
      } catch (err) {
        failed += 1
        console.error(`✗ ${item}:`, err.message)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, runOne))
  return failed
}

async function main() {
  const [baseKeys, existing] = await Promise.all([
    listBaseKeys(),
    listAllKeys(),
  ])
  const todo = missingKeys(baseKeys, existing)
  console.log(`原本 ${baseKeys.length} 枚 / 縮小版が足りない ${todo.length} 枚`)
  if (CHECK_ONLY || todo.length === 0) {
    if (todo.length > 0) process.exitCode = 1
    return
  }

  let done = 0
  const failed = await runPool(todo, async (key) => {
    const base = await downloadObject(key)
    await uploadVariants(base, key)
    done += 1
    if (done % 100 === 0) console.log(`  ${done} / ${todo.length}`)
  })
  console.log(
    `✓ ${done} 枚に縮小版を足した${failed ? ` / 失敗 ${failed}` : ''}`
  )
  if (failed) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
