// よみの記法 [す] (2 桁を読むかなを 1 桁目だけで読む) のアプリ側の写し。
// 正本は src/kana-notation.js (D-0062)。食い違いは src/__tests__/reading-parity.test.js が検出する。

export type NotationSegment = { text: string; half: boolean }

const HALF = /\[([ぁ-ゖ]{1,2})\]/g

export const hasNotation = (kana: string) => /[[\]]/.test(kana)

export const stripNotation = (kana: string) => kana.replace(HALF, '$1')

/** 地のかな / 1 桁読み の区間に分ける。括弧の対応が取れなければ null */
export function parseNotation(kana: string): NotationSegment[] | null {
  const segments: NotationSegment[] = []
  let last = 0
  for (const m of kana.matchAll(HALF)) {
    const at = m.index ?? 0
    if (at > last) segments.push({ text: kana.slice(last, at), half: false })
    segments.push({ text: m[1], half: true })
    last = at + m[0].length
  }
  if (last < kana.length) segments.push({ text: kana.slice(last), half: false })
  return segments.some((s) => !s.half && /[[\]]/.test(s.text)) ? null : segments
}
