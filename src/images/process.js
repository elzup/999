// 画像 Buffer を 400x400 webp に変換し、content-hash からストレージキーを決める。

import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const IMG_SIZE = 400

/**
 * 400x400 cover-crop の webp に変換する。
 * @param {Buffer} input
 * @returns {Promise<Buffer>}
 */
export async function toWebp(input) {
  return sharp(input)
    .resize(IMG_SIZE, IMG_SIZE, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toBuffer()
}

/** 上寄せで 400x400 にクロップ (顔が上にある画像の救済用) */
export async function toWebpTop(input) {
  return sharp(input)
    .resize(IMG_SIZE, IMG_SIZE, { fit: 'cover', position: 'top' })
    .webp({ quality: 82 })
    .toBuffer()
}

/** content-addressed なキー words/<sha256先頭20hex>.webp */
export function hashKey(webpBuffer) {
  const hex = createHash('sha256').update(webpBuffer).digest('hex').slice(0, 20)
  return { hash: hex, key: `words/${hex}.webp` }
}
