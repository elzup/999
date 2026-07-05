import { decodeRanked } from './decoder.js'

/**
 * 長い数字列を3桁ごとのチャンクに分割する。
 * 末尾が3桁に満たない場合はそのまま端数チャンクとして残す。
 *
 * @param {string} digits 数字のみからなる文字列
 * @returns {string[]} 3桁（末尾のみ1〜2桁の場合あり）のチャンク配列
 */
export function chunkDigits(digits) {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`Expected digits only, got "${digits}"`)
  }

  const chunks = []
  for (let i = 0; i < digits.length; i += 3) {
    chunks.push(digits.slice(i, i + 3))
  }
  return chunks
}

/**
 * 長い数字列を3桁ごとに分割し、各チャンクを最良スコアの単語へ変換して
 * 「物語」として記憶しやすい形にまとめる。
 *
 * @param {string} digits 数字のみからなる文字列
 * @returns {{
 *   chunks: Array<{ digits: string, word: string|null, score: number, candidates: Array<{word: string, score: number}> }>,
 *   story: string
 * }}
 */
export function chunkStory(digits) {
  const chunks = chunkDigits(digits).map((chunk) => {
    const ranked = decodeRanked(chunk)
    const best = ranked[0] ?? null
    return {
      digits: chunk,
      word: best?.word ?? null,
      score: best?.score ?? 0,
      candidates: ranked.map(({ word, score }) => ({ word, score })),
    }
  })

  const story = chunks.map((c) => c.word ?? `[${c.digits}]`).join(' ')

  return { chunks, story }
}
