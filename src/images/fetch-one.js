// 1 枠ぶんの画像を取る: 検索 → DL → 400x400 webp → GCS へ上げる。
// Mac (direct.js / console) と Function (web 版 console) で共用する。保存先の文書・ファイルには触らない。
// アップロードは引数で受け取る (Mac は鍵ファイル、Function は実行用のサービスアカウントで上げるため)。
// saveOriginal (縮小版を作らずに 1 ファイル上げる) を渡すと、切り抜き直し用の元画像も残す (D-0095)。

import { downloadImage } from './download.js'
import {
  hashKey,
  originalKey,
  toOriginalWebp,
  toWebp,
  toWebpAt,
  toWebpRect,
} from './process.js'
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
      return { result, buffer, webp: await toWebp(buffer) }
    } catch (err) {
      console.error(`  DL失敗 ${result.imageUrl}: ${err.message || err}`)
      lastError = err
    }
  }
  throw new Error(`候補の取得に全部失敗: ${lastError?.message || lastError}`)
}

/** 切り抜き直し用の元画像を上げて URL を返す。saveOriginal が無ければ残さない */
async function storeOriginal(buffer, saveOriginal) {
  if (!saveOriginal) return null
  const webp = await toOriginalWebp(buffer)
  return (await saveOriginal(webp, originalKey(webp))).url
}

async function store(
  webp,
  { sourcePage, sourceImageUrl, originalUrl },
  uploadWebp
) {
  const { hash, key } = hashKey(webp)
  const { url } = await uploadWebp(webp, key)
  return {
    url,
    hash,
    sourcePage: sourcePage || '',
    sourceImageUrl,
    ...(originalUrl ? { originalUrl } : {}),
    uploadedAt: new Date().toISOString(),
  }
}

/** 検索結果 1 件ぶんを上げる (400px の原本と、渡されていれば元画像) */
async function storeResult({ result, buffer, webp }, uploadWebp, saveOriginal) {
  const originalUrl = await storeOriginal(buffer, saveOriginal)
  return store(
    webp,
    {
      sourcePage: result.sourcePage,
      sourceImageUrl: result.imageUrl,
      originalUrl,
    },
    uploadWebp
  )
}

/**
 * 検索して最初に取れた画像を上げる。
 * @param {{query: string, rejected?: string[], uploadWebp: Function, saveOriginal?: Function, search?: Function}} opts
 * @returns {Promise<object|null>} 上げた画像 (見つからなければ null)
 */
export async function fetchBySearch({
  query,
  rejected = [],
  uploadWebp,
  saveOriginal,
  search = searchImages,
}) {
  const results = await search(query, rejected, true)
  if (results.length === 0) return null
  return storeResult(await fetchFirstUsable(results), uploadWebp, saveOriginal)
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
  saveOriginal,
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
      return { result, buffer, webp: await toWebp(buffer) }
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
      .map((usable) => storeResult(usable, uploadWebp, saveOriginal))
  )
}

/**
 * 今の画像の元画像を、寄せ方を決めて切り抜き直す (上寄せ = 顔が上にある画像の救済)。
 * rect があれば寄せ方より優先し、その範囲で切り抜く (全画面プレビューで決めた範囲)
 */
export async function recropAt({
  image,
  uploadWebp,
  saveOriginal,
  position = 'top',
  rect,
  download = downloadImage,
}) {
  const { buffer, originalUrl } = await loadOriginal(image, {
    saveOriginal,
    download,
  })
  const webp = rect
    ? await toWebpRect(buffer, rect)
    : await toWebpAt(buffer, position)
  const next = await store(webp, { ...image, originalUrl }, uploadWebp)
  return { ...image, ...next }
}

/** 元サイトが再 DL を断ったときの文言。元画像を残す前に取った画像で起きる */
export const SOURCE_REFUSED =
  '元サイトが元画像の再取得を拒否しました。候補から取り直してください'

/**
 * 切り抜き直す元画像を読む。残してある元画像 (originalUrl) を優先し、無ければ元サイトから取る。
 * 元サイトから取れたら残しておく (次からは元サイトに頼らない)
 */
async function loadOriginal(image, { saveOriginal, download }) {
  if (image?.originalUrl) {
    const { buffer } = await download(image.originalUrl)
    return { buffer, originalUrl: image.originalUrl }
  }
  if (!image?.sourceImageUrl) throw new Error('元画像URLが無い')
  let buffer
  try {
    ;({ buffer } = await download(image.sourceImageUrl))
  } catch (err) {
    console.error('元画像の再取得に失敗', image.sourceImageUrl, err)
    if (/^HTTP 40[13]\b/.test(String(err?.message)))
      throw new Error(SOURCE_REFUSED)
    throw err
  }
  return { buffer, originalUrl: await storeOriginal(buffer, saveOriginal) }
}

/** 上寄せで切り抜き直す (recropAt の上寄せ) */
export const recropTop = ({ image, uploadWebp, saveOriginal }) =>
  recropAt({ image, uploadWebp, saveOriginal, position: 'top' })
