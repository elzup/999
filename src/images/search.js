// キー不要の画像検索をプロバイダ順に試す。DDG が落ちたら Bing に逃がす。

import { bingSearchImages } from './bing.js'
import { ddgSearchImages } from './ddg.js'

const PROVIDERS = [
  { name: 'ddg', search: ddgSearchImages },
  { name: 'bing', search: bingSearchImages },
]

const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i

/** 拡張子が画像と分かる URL を先頭に寄せる (HTML ページへのリンクを掴みにくくする) */
function preferImageExt(results) {
  return [
    ...results.filter((r) => IMAGE_EXT.test(r.imageUrl)),
    ...results.filter((r) => !IMAGE_EXT.test(r.imageUrl)),
  ]
}

/**
 * 候補を優先順で返す。0 件・失敗のプロバイダは飛ばして次へ。
 * 全プロバイダが例外なら理由をまとめて throw、0 件だけなら [] を返す。
 * @param {string} query
 * @param {string[]} rejected  redo 時に避ける既出URL
 * @param {boolean} safe  セーフサーチ (既定 ON)
 * @param {{name:string, search:Function}[]} providers  テスト差し替え用
 * @returns {Promise<{imageUrl:string, sourcePage:string}[]>}
 */
export async function searchImages(
  query,
  rejected = [],
  safe = true,
  providers = PROVIDERS
) {
  const rejectedSet = new Set(rejected)
  const failures = []
  for (const provider of providers) {
    try {
      const results = (await provider.search(query, safe)).filter(
        (r) => r.imageUrl && !rejectedSet.has(r.imageUrl)
      )
      if (results.length > 0) return preferImageExt(results)
    } catch (err) {
      console.error(`  [${provider.name}] ${err.message || err}`)
      failures.push(`${provider.name}: ${err.message || err}`)
    }
  }
  if (failures.length === providers.length) {
    throw new Error(`画像検索が全滅 (${failures.join(' / ')})`)
  }
  return []
}

/**
 * 先頭候補だけ返す。
 * @returns {Promise<{imageUrl:string, sourcePage:string}|null>}
 */
export async function searchImage(query, rejected = [], safe = true) {
  const results = await searchImages(query, rejected, safe)
  return results[0] || null
}
