// 画像ピッカーの全画面プレビューで決める切り抜きの範囲 (純粋なロジック)。
// 範囲は元画像に対する割合 { x, y, w, h } (0〜1)。画素で正方形になるように w と h を決める
// (横長なら w < h)。Function の /console/recrop の rect にそのまま送る (src/images/process.js の toWebpRect)。
import type { CropPosition } from './imagePicker'

export type CropRect = { x: number; y: number; w: number; h: number }
export type Size = { width: number; height: number }

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

/** 一番小さくできる切り抜き (短い辺に対する割合) */
export const MIN_SCALE = 0.2

/**
 * 短い辺に対する割合 scale の正方形を、中心 (cx, cy) (割合) に置く。はみ出す分は内側へ寄せる
 */
export function squareAt(
  size: Size,
  scale: number,
  cx: number,
  cy: number
): CropRect {
  const side = Math.min(size.width, size.height) * clamp(scale, MIN_SCALE, 1)
  const w = side / size.width
  const h = side / size.height
  return {
    x: clamp(cx - w / 2, 0, 1 - w),
    y: clamp(cy - h / 2, 0, 1 - h),
    w,
    h,
  }
}

/** 寄せ方 (sharp の position と同じ置き方) で、短い辺いっぱいの正方形 */
export function presetRect(size: Size, position: CropPosition): CropRect {
  const centred = squareAt(size, 1, 0.5, 0.5)
  if (position === 'top') return { ...centred, y: 0 }
  if (position === 'bottom') return { ...centred, y: 1 - centred.h }
  if (position === 'left') return { ...centred, x: 0 }
  if (position === 'right') return { ...centred, x: 1 - centred.w }
  return centred
}

/** 短い辺に対する大きさ (1 = 短い辺いっぱい) */
export const scaleOf = (size: Size, rect: CropRect) =>
  (rect.w * size.width) / Math.min(size.width, size.height)

/** 範囲を (dx, dy) (割合) だけ動かす。はみ出さない */
export const moveRect = (rect: CropRect, dx: number, dy: number): CropRect => ({
  ...rect,
  x: clamp(rect.x + dx, 0, 1 - rect.w),
  y: clamp(rect.y + dy, 0, 1 - rect.h),
})

/** 中心を保ったまま大きさを変える */
export const resizeRect = (size: Size, rect: CropRect, scale: number) =>
  squareAt(size, scale, rect.x + rect.w / 2, rect.y + rect.h / 2)

/** 寄せ方のボタンで置いた範囲と同じか (どのボタンが効いているかを出す) */
export function matchingPreset(
  size: Size,
  rect: CropRect,
  positions: CropPosition[]
): CropPosition | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3
  return (
    positions.find((p) => {
      const r = presetRect(size, p)
      return near(r.x, rect.x) && near(r.y, rect.y) && near(r.w, rect.w)
    }) ?? null
  )
}

/**
 * 元画像の <img> を正方形の箱 (overflow: hidden) に置いて、範囲だけを見せる位置と大きさ
 * (確定前に切り抜きの結果を見せる)。CSS の背景ではなく <img> にするのは、referrerpolicy を
 * 付けられるため (直リンクを断るサイトでも全画面の表示と同じく読める)
 */
export const cropImageStyle = (rect: CropRect) => ({
  position: 'absolute',
  width: `${100 / rect.w}%`,
  height: `${100 / rect.h}%`,
  left: `${(-rect.x / rect.w) * 100}%`,
  top: `${(-rect.y / rect.h) * 100}%`,
  maxWidth: 'none',
})

/** 箱 (box) に元画像 (size) を contain で収めたときの表示の大きさ */
export function containSize(box: Size, size: Size): Size {
  const ratio = Math.min(box.width / size.width, box.height / size.height)
  return { width: size.width * ratio, height: size.height * ratio }
}
