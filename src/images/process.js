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

// 画面での表示は最大 72px (スライド)。3 倍密度でも 216px で足りるので 240px、
// 28〜34px の一覧 (一度に大量に出る) は 3 倍で 102px 前後なので 96px を用意する。
// 400px の原本は console など大きく出す場所のために残す
export const VARIANT_SIZES = [96, 240]

/**
 * 400px の原本から縮小版を作る。原本が正方形なのでクロップはせず縮めるだけ
 * @param {Buffer} baseWebp
 * @returns {Promise<{size: number, buffer: Buffer}[]>}
 */
export async function toVariants(baseWebp) {
  return Promise.all(
    VARIANT_SIZES.map(async (size) => ({
      size,
      buffer: await sharp(baseWebp)
        .resize(size, size, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer(),
    }))
  )
}

/** 原本のキー words/<hash>.webp に対する縮小版のキー words/<hash>@<size>.webp */
export function variantKey(baseKey, size) {
  return baseKey.replace(/\.webp$/, `@${size}.webp`)
}

/** content-addressed なキー words/<sha256先頭20hex>.webp */
export function hashKey(webpBuffer) {
  const hex = createHash('sha256').update(webpBuffer).digest('hex').slice(0, 20)
  return { hash: hex, key: `words/${hex}.webp` }
}
