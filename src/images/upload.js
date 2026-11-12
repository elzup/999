// GCS バケットへ webp を冪等アップロードし、public URL を返す。

import { join } from 'node:path'
import { Storage } from '@google-cloud/storage'
import { toVariants, variantKey } from './process.js'

export const BUCKET = process.env.WORDS_BUCKET || 'anoz-memosupo-words'

// 画像アップロード専用の鍵。汎用の GOOGLE_SERVICE_ACCOUNT_PATH は
// シート書き込み用 SA (sheet-writer) を指していることがあり、その SA は
// このバケットへの storage.objects.create を持たないため使わない。
const KEY_PATH =
  process.env.WORDS_UPLOADER_KEY ||
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
  const result = await saveOnce(webpBuffer, key)
  // 画面は srcset で縮小版を読むので、原本と必ず一緒に上げる (無いと画像が出ない)
  await uploadVariants(webpBuffer, key)
  return result
}

/**
 * 原本 (400px) から縮小版を作って上げる。既にあるものは skip (冪等)
 * @param {Buffer} baseWebp
 * @param {string} baseKey
 * @returns {Promise<number>} 新しく上げた数
 */
export async function uploadVariants(baseWebp, baseKey) {
  const variants = await toVariants(baseWebp)
  const results = await Promise.all(
    variants.map(({ size, buffer }) =>
      saveOnce(buffer, variantKey(baseKey, size))
    )
  )
  return results.filter((r) => !r.skipped).length
}

/** 原本の Buffer をバケットから読む (縮小版の後追い作成用) */
export async function downloadObject(key) {
  const [buffer] = await getBucket().file(key).download()
  return buffer
}

/** words/ 配下の原本 (縮小版を除く) のキー一覧 */
export async function listBaseKeys() {
  const [files] = await getBucket().getFiles({ prefix: 'words/' })
  return files
    .map((f) => f.name)
    .filter((name) => /^words\/[0-9a-f]+\.webp$/.test(name))
}

/** キーの存在一覧 (縮小版が揃っているかの確認用) */
export async function listAllKeys() {
  const [files] = await getBucket().getFiles({ prefix: 'words/' })
  return new Set(files.map((f) => f.name))
}

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
