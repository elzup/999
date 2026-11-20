// よみの記法のアプリ側の写し。仕様は docs/kana-notation.md (D-0093)。
//   スうる   半指定: カタカナの字は 2 桁を読むかなを 1 桁目だけで読む (す=33 → 3)
//   さばﾝな  読まない: 半角カナの字は数字にしない
// 正本は src/kana-notation.js。食い違いは src/__tests__/reading-parity.test.js が検出する。

export type NotationSegment = {
  /** 書かれたままの字 (半指定はカタカナ、読まないかなは半角カナ) */
  text: string
  /** 読むときのひらがな */
  hira: string
  half: boolean
  skip: boolean
}

const KATA = 'ァ-ヶ'
const HANKAKU = 'ｦ-ﾟ'
const HALF_SOURCE = `[${KATA}][ァィゥェォャュョー]?`
const SKIP_SOURCE = `[${HANKAKU}]+`
const NOTATION = new RegExp(`(${HALF_SOURCE})|(${SKIP_SOURCE})`, 'g')
const MARKS = new RegExp(`[${KATA}${HANKAKU}]`)
// 括弧・英数字は記法に無い字 (旧記法 (ん) [す] の残りを読めないよみにする)
const STRAY = /[\x00-\x7f（）［］]/

/** カタカナ → ひらがな (ヴ など対応の無い字はそのまま) */
export const kataToHiraText = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (ch) =>
    ch === 'ヵ' || ch === 'ヶ' || ch === 'ヴ'
      ? ch
      : String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )

/** 半角カナ → ひらがな (ｻﾞ → ざ, ｰ → ー) */
const hankakuToHira = (text: string) => kataToHiraText(text.normalize('NFKC'))

export const hasNotation = (kana: string) => MARKS.test(kana)

/** 記号を外したひらがなのかな。半指定も読まないかなもひらがなにして残す */
export const stripNotation = (kana: string) => hankakuToHira(kana)

/** 読むかなだけのひらがな (読まないかなを落とす) */
export const readPart = (kana: string) =>
  kataToHiraText(kana.replace(new RegExp(SKIP_SOURCE, 'g'), ''))

/** 地のかな / 半指定 / 読まない の区間に分ける。括弧・英数字があれば null */
export function parseNotation(kana: string): NotationSegment[] | null {
  const segments: NotationSegment[] = []
  let last = 0
  const plain = (text: string) => ({
    text,
    hira: text,
    half: false,
    skip: false,
  })
  for (const m of kana.matchAll(NOTATION)) {
    const at = m.index ?? 0
    if (at > last) segments.push(plain(kana.slice(last, at)))
    segments.push(
      m[1] !== undefined
        ? { text: m[1], hira: kataToHiraText(m[1]), half: true, skip: false }
        : { text: m[2], hira: hankakuToHira(m[2]), half: false, skip: true }
    )
    last = at + m[0].length
  }
  if (last < kana.length) segments.push(plain(kana.slice(last)))
  return segments.some((s) => !s.half && !s.skip && STRAY.test(s.text))
    ? null
    : segments
}
