// GCS バケットへ webp を冪等アップロードし、public URL を返す。

import { join } from 'node:path'
import { Storage } from '@google-cloud/storage'

export const BUCKET = process.env.WORDS_BUCKET || 'anoz-memosupo-words'

const KEY_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
  join(process.cwd(), '.config', 'words-uploader.json')

let bucketRef = null
function getBucket() {
  if (!bucketRef) {
    const storage = new Storage({ keyFilename: KEY_PATH })
    bucketRef = storage.bucket(BUCKET)
  }
  return bucketRef
}

export function publicUrl(key) {
  return `https://storage.googleapis.com/${BUCKET}/${key}`
}

/**
 * content-addressed key へ upload。既存なら skip（冪等）。
 * @param {Buffer} webpBuffer
 * @param {string} key  例 words/<hash>.webp
 * @returns {Promise<{url: string, skipped: boolean}>}
 */
export async function uploadWebp(webpBuffer, key) {
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
