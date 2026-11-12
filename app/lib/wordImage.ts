// 語の画像を表示サイズに合った大きさで読む (レスポンシブ画像)。
// 画像バケットには原本 words/<hash>.webp (400px) と縮小版 @96 / @240 がある
// (src/images/process.js の VARIANT_SIZES)。srcset に並べると、ブラウザが
// 表示サイズ × 画面の密度に足りる一番小さいものを選ぶ。
const BUCKET_IMAGE =
  /^(https:\/\/storage\.googleapis\.com\/[^/]+\/words\/[0-9a-f]+)\.webp$/
const ORIGINAL_SIZE = 400
const VARIANT_SIZES = [96, 240] as const

export type WordImageProps = {
  src: string
  srcset?: string
  sizes?: string
}

/**
 * <img> に渡す src / srcset / sizes。
 * @param url 配信データの画像 URL (原本)
 * @param displayPx CSS での表示幅 (px)
 */
export function wordImage(url: string, displayPx: number): WordImageProps {
  const match = BUCKET_IMAGE.exec(url)
  // バケットの外の画像 (手で貼った URL など) は縮小版が無いのでそのまま
  if (!match) return { src: url }
  const base = match[1]
  const srcset = [
    ...VARIANT_SIZES.map((size) => `${base}@${size}.webp ${size}w`),
    `${url} ${ORIGINAL_SIZE}w`,
  ].join(', ')
  return { src: url, srcset, sizes: `${displayPx}px` }
}
