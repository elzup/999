// よみ (かなセル) の記法。今は «1 桁読み» の 1 種だけ (D-0062)。
//
//   [す]うる = 376   2 桁を読むかな (す=33) を 1 桁目だけで読む
//
// 数字を自由に書ける記法にしないのは、誤ったよみまで記号 1 つで通ってしまうから。
// 囲めるのはひらがな 1〜2 文字 (2 文字は拗音 [ちゃ] など、1 トークンで 2 桁を読むもの)。
// シートの見直しマーカー ([x] [b] 等) は英字なので、中身がひらがなかで区別できる。
//
// このモジュールは Function からも読む (encoder 経由)。fs 依存を持ち込まないこと。

const HALF = /\[([ぁ-ゖ]{1,2})\]/g

/** シートの check 列 (REGEXMATCH) と同じ «かなセルとして正しい形» */
export const KANA_CELL_PATTERN = '^([ぁ-ゖ]|\\[[ぁ-ゖ]{1,2}\\])+$'

export const hasNotation = (kana) => /[[\]]/.test(String(kana ?? ''))

/** 記号を外したかな (語との突き合わせ・表示の地の文用) */
export const stripNotation = (kana) => String(kana ?? '').replace(HALF, '$1')

/**
 * よみを 地のかな / 1 桁読み の区間に分ける。
 * 括弧の対応が取れない・中身がひらがなでないときは throw (読めないよみとして扱わせる)。
 * @returns {{ text: string, half: boolean }[]}
 */
export function parseNotation(kana) {
  const input = String(kana ?? '')
  const segments = []
  let last = 0
  for (const m of input.matchAll(HALF)) {
    if (m.index > last)
      segments.push({ text: input.slice(last, m.index), half: false })
    segments.push({ text: m[1], half: true })
    last = m.index + m[0].length
  }
  if (last < input.length)
    segments.push({ text: input.slice(last), half: false })
  const stray = segments.find((s) => !s.half && /[[\]]/.test(s.text))
  if (stray)
    throw new Error(
      `記法の括弧が閉じていない / 中身がひらがなでない: "${input}"`
    )
  return segments
}
