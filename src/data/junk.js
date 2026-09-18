// シート由来の欠損・エラー値の正本。
//
// 同じ判定が src/ff-reading.js (Set) と app/lib/ffQuiz.ts (正規表現) に
// 別々に書かれていて、内容がずれていた (`＿` は正規表現側にしか無い)。
// 片方だけに足した値は、もう片方をすり抜ける。ここを 1 つの出所にする。
//
// 依存を持たない素の ESM。node のスクリプト (src/) と vite のアプリ (app/) が
// 同じものを読む。

/** シートが返す欠損・数式エラーの印 */
export const JUNK_MARKERS = ['—', '＿', '#REF!', '#N/A', '#ERROR!', '#VALUE!']

/** それ自体が欠損を意味する値 (部分一致させると普通の語を巻き込む) */
export const JUNK_EXACT = ['', 'FALSE', 'TRUE']

const JUNK_SET = new Set([...JUNK_MARKERS, ...JUNK_EXACT])

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 語の中に欠損の印が混じっているか。
 * `#REF!` などは連結された結果の一部として現れるので部分一致で見る。
 * `FALSE` / `TRUE` は語として成立しうるため、全体一致のときだけ欠損とみなす。
 */
const CONTAINS_JUNK = new RegExp(
  `${JUNK_MARKERS.map(escapeRe).join('|')}|^(?:${JUNK_EXACT.filter(Boolean)
    .map(escapeRe)
    .join('|')})$`
)

/** 値そのものが欠損の印か (全体一致) */
export const isJunk = (value) => JUNK_SET.has(String(value ?? '').trim())

/** 値が欠損の印を含むか (部分一致。連結済みの読みを弾くのに使う) */
export const containsJunk = (value) => CONTAINS_JUNK.test(String(value ?? ''))
