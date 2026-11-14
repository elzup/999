// 語の画像を表示サイズに合った大きさで読む (レスポンシブ画像)。
// 画像バケットには原本 words/<hash>.webp (400px) と縮小版 @96 / @240 がある
// (src/images/process.js の VARIANT_SIZES)。srcset に並べると、ブラウザが
// 表示サイズ × 画面の密度に足りる一番小さいものを選ぶ。
import { parseWord } from './wordTags'

const BUCKET_IMAGE =
  /^(https:\/\/storage\.googleapis\.com\/[^/]+\/words\/[0-9a-f]+)\.webp$/
const ORIGINAL_SIZE = 400
const VARIANT_SIZES = [96, 240] as const

export type WordImageProps = {
  src: string
  srcset?: string
  sizes?: string
  /** #g (概念) の語。画像に枠を付けて、実物の写真ではないことを一目で分かるようにする (style.css) */
  'data-concept'?: true
}

/** 概念 (#g) の語か */
export const isConceptWord = (word: string | undefined) =>
  Boolean(word) && parseWord(word as string).tags.includes('g')

/**
 * <img> に渡す src / srcset / sizes。
 * @param url 配信データの画像 URL (原本)
 * @param displayPx CSS での表示幅 (px)
 * @param word その画像の語。#g (概念) なら枠を付ける印を足す
 */
export function wordImage(
  url: string,
  displayPx: number,
  word?: string
): WordImageProps {
  const concept = isConceptWord(word) ? { 'data-concept': true as const } : {}
  const match = BUCKET_IMAGE.exec(url)
  // バケットの外の画像 (手で貼った URL など) は縮小版が無いのでそのまま
  if (!match) return { src: url, ...concept }
  const base = match[1]
  const srcset = [
    ...VARIANT_SIZES.map((size) => `${base}@${size}.webp ${size}w`),
    `${url} ${ORIGINAL_SIZE}w`,
  ].join(', ')
  return { src: url, srcset, sizes: `${displayPx}px`, ...concept }
}
