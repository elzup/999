// よみの記法のアプリ側の写し。2 種類ある。
//   [す]うる   1 桁読み: 2 桁を読むかなを 1 桁目だけで読む (す=33 → 3)
//   さば(ん)な 読まない: ( ) の中のかなは数字にしない (中間の省略)
// 正本は src/kana-notation.js (D-0062)。食い違いは src/__tests__/reading-parity.test.js が検出する。

export type NotationSegment = { text: string; half: boolean; skip: boolean }

const NOTATION = /\[([ぁ-ゖ]{1,2})\]|\(([ぁ-ゖー]{1,2})\)/g
const BRACKETS = /[[\]()]/

export const hasNotation = (kana: string) => BRACKETS.test(kana)

export const stripNotation = (kana: string) =>
  kana.replace(
    NOTATION,
    (_, half?: string, skip?: string) => half ?? skip ?? ''
  )

/** 地のかな / 1 桁読み / 読まない の区間に分ける。括弧の対応が取れなければ null */
export function parseNotation(kana: string): NotationSegment[] | null {
  const segments: NotationSegment[] = []
  let last = 0
  const plain = (text: string) => ({ text, half: false, skip: false })
  for (const m of kana.matchAll(NOTATION)) {
    const at = m.index ?? 0
    if (at > last) segments.push(plain(kana.slice(last, at)))
    segments.push(
      m[1] !== undefined
        ? { text: m[1], half: true, skip: false }
        : { text: m[2], half: false, skip: true }
    )
    last = at + m[0].length
  }
  if (last < kana.length) segments.push(plain(kana.slice(last)))
  return segments.some((s) => !s.half && !s.skip && BRACKETS.test(s.text))
    ? null
    : segments
}
