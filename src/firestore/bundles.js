// 読み込み用チャンク。
// spec: .vsdd/firestore-store/specs/design-read-bundles.md
//
// 1 番号 1 ドキュメントのままアプリが全件読むと 1000 read/ロードになり、
// 無料枠 (50,000 read/日) を 50 ロードで使い切る。100 件ずつ 10 個に集約して
// 全件ロードを 10 read に落とす。実測で 1 チャンク約 80 KB (上限 1 MiB)。

import { MAX_DOC_BYTES } from './number-doc.js'

/** 1 チャンクが受け持つ番号の幅 */
export const BUNDLE_SIZE = 100
export const CHUNK_COUNT = 1000 / BUNDLE_SIZE

/** 上限ぎりぎりまで使わない。余白を残して早めに気付けるようにする */
const SIZE_BUDGET = MAX_DOC_BYTES * 0.8

export function bundleIdFor(num) {
  if (!/^\d{3}$/.test(num)) throw new Error(`invalid num: ${num}`)
  return `chunk_${Math.floor(Number(num) / BUNDLE_SIZE)}`
}

function rangeOf(bundleId) {
  const match = /^chunk_(\d)$/.exec(bundleId)
  if (!match) throw new Error(`unknown chunk: ${bundleId}`)
  const index = Number(match[1])
  return { start: index * BUNDLE_SIZE, end: (index + 1) * BUNDLE_SIZE }
}

/**
 * 1 チャンクを組み立てる。渡された docs のうち、そのチャンクの範囲に
 * 入るものだけを num 昇順で載せる。
 */
export function buildBundle(bundleId, docs, { now }) {
  const { start, end } = rangeOf(bundleId)
  const numbers = docs
    .filter((doc) => {
      const value = Number(doc.num)
      return value >= start && value < end
    })
    .sort((a, b) => a.num.localeCompare(b.num))

  const bundle = { id: bundleId, builtAt: now, numbers }
  const bytes = Buffer.byteLength(JSON.stringify(bundle))
  if (bytes >= SIZE_BUDGET) {
    throw new Error(`bundle ${bundleId} too large: ${bytes} bytes`)
  }
  return bundle
}

export function buildAllBundles(docs, { now }) {
  return Array.from({ length: CHUNK_COUNT }, (_, i) =>
    buildBundle(`chunk_${i}`, docs, { now })
  )
}

/** チャンク群を 1 つの番号配列に戻す (アプリ側の組み立て) */
export function mergeBundles(bundles) {
  return [...bundles]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((bundle) => bundle.numbers)
}
