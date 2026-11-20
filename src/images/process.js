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

/** 切り抜きの寄せ方。sharp の position にそのまま渡す (centre は中央) */
export const CROP_POSITIONS = ['top', 'bottom', 'left', 'right', 'centre']

/**
 * 寄せ方を決めて 400x400 にクロップする (自動の切り抜きで顔や本体が切れた画像の救済用)
 * @param {Buffer} input
 * @param {string} position CROP_POSITIONS のどれか
 */
export async function toWebpAt(input, position) {
  if (!CROP_POSITIONS.includes(position))
    throw new Error(`切り抜きの寄せ方が不正: ${position}`)
  return sharp(input)
    .resize(IMG_SIZE, IMG_SIZE, { fit: 'cover', position })
    .webp({ quality: 82 })
    .toBuffer()
}

/**
 * 元画像の中の範囲を指定して 400x400 に切り抜く (画像ピッカーの全画面プレビューで決めた範囲)。
 * 範囲は向きを直した (EXIF の回転を当てた) 元画像に対する割合。ブラウザの表示と同じ向きで測るため
 * @param {Buffer} input
 * @param {{x: number, y: number, w: number, h: number}} rect 左上と幅・高さ (0〜1)
 */
export async function toWebpRect(input, rect) {
  if (!isCropRect(rect)) throw new Error('切り抜きの範囲が不正')
  const { data, info } = await sharp(input)
    .rotate()
    .toBuffer({ resolveWithObject: true })
  const left = Math.min(info.width - 1, Math.round(rect.x * info.width))
  const top = Math.min(info.height - 1, Math.round(rect.y * info.height))
  const width = Math.max(
    1,
    Math.min(info.width - left, Math.round(rect.w * info.width))
  )
  const height = Math.max(
    1,
    Math.min(info.height - top, Math.round(rect.h * info.height))
  )
  return sharp(data)
    .extract({ left, top, width, height })
    .resize(IMG_SIZE, IMG_SIZE, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer()
}

const EPS = 1e-6
/** 切り抜きの範囲として受け付けられるか (割合で、元画像からはみ出さない) */
export function isCropRect(rect) {
  if (!rect || typeof rect !== 'object') return false
  const { x, y, w, h } = rect
  if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v)))
    return false
  return (
    x >= 0 &&
    y >= 0 &&
    w > 0.01 &&
    h > 0.01 &&
    x + w <= 1 + EPS &&
    y + h <= 1 + EPS
  )
}

/** 上寄せで 400x400 にクロップ (顔が上にある画像の救済用) */
export const toWebpTop = (input) => toWebpAt(input, 'top')

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
