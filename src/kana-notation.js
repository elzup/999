// よみ (かなセル) の記法 (D-0062)。2 種類ある。
//
//   [す]うる = 376   1 桁読み: 2 桁を読むかな (す=33) を 1 桁目だけで読む
//   さば(ん)な = 387  読まない: ( ) の中のかなは数字にしない (中間の省略。rankey の !)
//
// 数字を自由に書ける記法にしないのは、誤ったよみまで記号 1 つで通ってしまうから。
// 囲めるのはひらがな 1〜2 文字 (2 文字は拗音 [ちゃ] など、1 トークンで 2 桁を読むもの)。
// シートの見直しマーカー ([x] [b] 等) は英字なので、中身がひらがなかで区別できる。
// 読まないかなの記法が無かった頃は rankey が «1 文字飛ばせば合う» を自動で探していた。
// 記法の付いたよみは書いた人が読み方を決めているので、自動の探索はしない。
//
// このモジュールは Function からも読む (encoder 経由)。fs 依存を持ち込まないこと。

const NOTATION = /\[([ぁ-ゖ]{1,2})\]|\(([ぁ-ゖ]{1,2})\)/g
const BRACKETS = /[[\]()]/

/** シートの check 列 (REGEXMATCH) と同じ «かなセルとして正しい形» */
export const KANA_CELL_PATTERN =
  '^([ぁ-ゖ]|\\[[ぁ-ゖ]{1,2}\\]|\\([ぁ-ゖ]{1,2}\\))+$'

export const hasNotation = (kana) => BRACKETS.test(String(kana ?? ''))

/** 記号を外したかな (語との突き合わせ・表示の地の文用)。読まないかなも残す */
export const stripNotation = (kana) =>
  String(kana ?? '').replace(NOTATION, (_, half, skip) => half ?? skip)

/**
 * よみを 地のかな / 1 桁読み / 読まない の区間に分ける。
 * 括弧の対応が取れない・中身がひらがなでないときは throw (読めないよみとして扱わせる)。
 * @returns {{ text: string, half: boolean, skip: boolean }[]}
 */
export function parseNotation(kana) {
  const input = String(kana ?? '')
  const segments = []
  let last = 0
  const plain = (text) => ({ text, half: false, skip: false })
  for (const m of input.matchAll(NOTATION)) {
    if (m.index > last) segments.push(plain(input.slice(last, m.index)))
    segments.push(
      m[1] !== undefined
        ? { text: m[1], half: true, skip: false }
        : { text: m[2], half: false, skip: true }
    )
    last = m.index + m[0].length
  }
  if (last < input.length) segments.push(plain(input.slice(last)))
  const stray = segments.find(
    (s) => !s.half && !s.skip && BRACKETS.test(s.text)
  )
  if (stray)
    throw new Error(
      `記法の括弧が閉じていない / 中身がひらがなでない: "${input}"`
    )
  return segments
}
