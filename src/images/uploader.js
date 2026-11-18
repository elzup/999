// GCS バケットへ webp を冪等アップロードする部分 (バケットの作り方に依らない)。
// Mac は鍵ファイルで作ったバケット (upload.js)、Function は実行用のサービスアカウントのバケットを渡す。

import { toVariants, variantKey } from './process.js'

export const BUCKET = process.env.WORDS_BUCKET || 'anoz-memosupo-words'

export function publicUrl(key) {
  return `https://storage.googleapis.com/${BUCKET}/${key}`
}

/**
 * @param {() => import('@google-cloud/storage').Bucket} getBucket  使うときに初めて作る
 */
export function createUploader(getBucket) {
  async function saveOnce(webpBuffer, key) {
    const file = getBucket().file(key)
    const [exists] = await file.exists()
    if (!exists) {
      await file.save(webpBuffer, {
        resumable: false,
        contentType: 'image/webp',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })
    }
    return { url: publicUrl(key), skipped: exists }
  }

  /**
   * 原本 (400px) から縮小版を作って上げる。既にあるものは skip (冪等)
   * @returns {Promise<number>} 新しく上げた数
   */
  async function uploadVariants(baseWebp, baseKey) {
    const variants = await toVariants(baseWebp)
    const results = await Promise.all(
      variants.map(({ size, buffer }) =>
        saveOnce(buffer, variantKey(baseKey, size))
      )
    )
    return results.filter((r) => !r.skipped).length
  }

  /**
   * content-addressed key へ upload。既存なら skip (冪等)。
   * @param {Buffer} webpBuffer
   * @param {string} key  例 words/<hash>.webp
   * @returns {Promise<{url: string, skipped: boolean}>}
   */
  async function uploadWebp(webpBuffer, key) {
    const result = await saveOnce(webpBuffer, key)
    // 画面は srcset で縮小版を読むので、原本と必ず一緒に上げる (無いと画像が出ない)
    await uploadVariants(webpBuffer, key)
    return result
  }

  return { saveOnce, uploadVariants, uploadWebp }
}
