// GCS バケットへ webp を冪等アップロードし、public URL を返す。

import { join } from 'node:path'
import { Storage } from '@google-cloud/storage'
import { BUCKET, createUploader, publicUrl } from './uploader.js'

export { BUCKET, publicUrl }

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

const uploader = createUploader(getBucket)

/** content-addressed key へ upload。既存なら skip (冪等)。縮小版も一緒に上げる */
export const uploadWebp = uploader.uploadWebp

/** 原本 (400px) から縮小版を作って上げる。既にあるものは skip (冪等) */
export const uploadVariants = uploader.uploadVariants

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
