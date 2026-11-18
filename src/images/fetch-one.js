// 1 枠ぶんの画像を取る: 検索 → DL → 400x400 webp → GCS へ上げる。
// Mac (direct.js / console) と Function (web 版 console) で共用する。保存先の文書・ファイルには触らない。
// アップロードは引数で受け取る (Mac は鍵ファイル、Function は実行用のサービスアカウントで上げるため)。

import { downloadImage } from './download.js'
import { hashKey, toWebp, toWebpTop } from './process.js'
import { searchImages } from './search.js'

// 先頭候補はホットリンク拒否・HTML 応答・巨大画像で落ちやすいので、上位を順に試す
const MAX_DOWNLOAD_TRIES = 5

/** 候補を上から DL→webp 変換し、最初に通ったものを返す。全滅なら最後の理由で throw */
export async function fetchFirstUsable(
  results,
  { download = downloadImage } = {}
) {
  let lastError = null
  for (const result of results.slice(0, MAX_DOWNLOAD_TRIES)) {
    try {
      const { buffer } = await download(result.imageUrl)
      return { result, webp: await toWebp(buffer) }
    } catch (err) {
      console.error(`  DL失敗 ${result.imageUrl}: ${err.message || err}`)
      lastError = err
    }
  }
  throw new Error(`候補の取得に全部失敗: ${lastError?.message || lastError}`)
}

async function store(webp, { sourcePage, sourceImageUrl }, uploadWebp) {
  const { hash, key } = hashKey(webp)
  const { url } = await uploadWebp(webp, key)
  return {
    url,
    hash,
    sourcePage: sourcePage || '',
    sourceImageUrl,
    uploadedAt: new Date().toISOString(),
  }
}

/**
 * 検索して最初に取れた画像を上げる。
 * @param {{query: string, rejected?: string[], uploadWebp: Function, search?: Function}} opts
 * @returns {Promise<object|null>} 上げた画像 (見つからなければ null)
 */
export async function fetchBySearch({
  query,
  rejected = [],
  uploadWebp,
  search = searchImages,
}) {
  const results = await search(query, rejected, true)
  if (results.length === 0) return null
  const { result, webp } = await fetchFirstUsable(results)
  return store(
    webp,
    { sourcePage: result.sourcePage, sourceImageUrl: result.imageUrl },
    uploadWebp
  )
}

// ピッカーに並べる候補の数。ボトムシートの 3×2 のうち 1 枠は «今» (D-0088 A-1)
export const CANDIDATE_COUNT = 5
// 候補の DL は落ちやすいので、並べる数より多めに試す。多すぎると Hosting の 60 秒に届く
const CANDIDATE_TRIES = 10

/**
 * 検索して、取れた画像を上位から最大 count 枚上げる (ピッカー用)。DL は並列で行う。
 * @returns {Promise<object[]>} 上げた画像 (検索の順。取れなかったものは除く)
 */
export async function fetchCandidates({
  query,
  rejected = [],
  uploadWebp,
  count = CANDIDATE_COUNT,
  search = searchImages,
  download = downloadImage,
}) {
  const results = (await search(query, rejected, true)).slice(
    0,
    CANDIDATE_TRIES
  )
  const settled = await Promise.allSettled(
    results.map(async (result) => {
      const { buffer } = await download(result.imageUrl)
      return { result, webp: await toWebp(buffer) }
    })
  )
  const usable = settled
    .filter((s) => s.status === 'fulfilled')
    .map((s) => s.value)
  // 同じ画像が別 URL で返ることがあるので hash で重ねない
  const seen = new Set()
  const unique = usable.filter(({ webp }) => {
    const { hash } = hashKey(webp)
    if (seen.has(hash)) return false
    seen.add(hash)
    return true
  })
  return Promise.all(
    unique
      .slice(0, count)
      .map(({ result, webp }) =>
        store(
          webp,
          { sourcePage: result.sourcePage, sourceImageUrl: result.imageUrl },
          uploadWebp
        )
      )
  )
}

/** 今の画像の元画像を上寄せで切り抜き直す (顔が上にある画像の救済) */
export async function recropTop({ image, uploadWebp }) {
  if (!image?.sourceImageUrl) throw new Error('元画像URLが無い')
  const { buffer } = await downloadImage(image.sourceImageUrl)
  const next = await store(await toWebpTop(buffer), image, uploadWebp)
  return { ...image, ...next }
}
