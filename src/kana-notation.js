// よみ (かなセル) の記法。仕様は docs/kana-notation.md (D-0092)。書き方は次の 3 つだけ。
//
//   すうる      ひらがな   対応表どおりに読む
//   スうる=376  カタカナ   2 桁を読むかな (す=33) を 1 桁目だけで読む (半指定)
//   さば(ん)な  ( )        中のかなは数字にしない (読まないかな)
//
// 1 つの読み方に書き方を 1 通りにするため、半指定は入力もカタカナにした (QA-0067)。
// 旧記法 [す] は廃止 (データは 0 件のまま廃止したので移行は無い)。[ ] が残っていれば読めないよみ。
// 数字を自由に書ける記法にしないのは、誤ったよみまで記号 1 つで通ってしまうから。
// 半指定は カタカナ 1 字 (+ 小書き / ー) で 1 トークン: ツ / チャ / キー。
// ( ) はひらがな 1〜2 字と ー を囲める (ミッキ(ー))。
// シートの見直しマーカー ([x] [b] 等) は英字で、かなセルには書かない。
//
// このモジュールは Function からも読む (encoder 経由)。fs 依存を持ち込まないこと。

const KATA = 'ァ-ヶ'
const HALF_SOURCE = `[${KATA}][ァィゥェォャュョー]?`
const SKIP_SOURCE = '\\(([ぁ-ゖー]{1,2})\\)'
const NOTATION = new RegExp(`(${HALF_SOURCE})|${SKIP_SOURCE}`, 'g')
const MARKS = new RegExp(`[${KATA}()]`)
const BRACKETS = /[[\]()]/

/** シートの check 列 (REGEXMATCH) と同じ «かなセルとして正しい形» */
export const KANA_CELL_PATTERN = `^([ぁ-ゖ]|${HALF_SOURCE}|\\([ぁ-ゖー]{1,2}\\))+$`

/** カタカナ → ひらがな (ヴ など対応の無い字はそのまま) */
const toHira = (text) =>
  text.replace(/[ァ-ヶ]/g, (ch) =>
    ch === 'ヵ' || ch === 'ヶ' || ch === 'ヴ'
      ? ch
      : String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )

export const hasNotation = (kana) => MARKS.test(String(kana ?? ''))

/** 記号を外したひらがなのかな (語との突き合わせ用)。半指定はひらがなに、読まないかなも残す */
export const stripNotation = (kana) =>
  toHira(String(kana ?? '').replace(/[()]/g, ''))

/** 読むかなだけのひらがな (読まないかなを落とす)。語尾の一致などを見る用 */
export const readPart = (kana) =>
  toHira(String(kana ?? '').replace(new RegExp(SKIP_SOURCE, 'g'), ''))

/**
 * よみを 地のかな / 半指定 / 読まない の区間に分ける。
 * text は書かれたままの字 (半指定はカタカナ)。hira は読むときのひらがな。
 * 括弧の対応が取れない・[ ] が残っているときは throw (読めないよみとして扱わせる)。
 * @returns {{ text: string, hira: string, half: boolean, skip: boolean }[]}
 */
export function parseNotation(kana) {
  const input = String(kana ?? '')
  const segments = []
  let last = 0
  const plain = (text) => ({ text, hira: text, half: false, skip: false })
  for (const m of input.matchAll(NOTATION)) {
    if (m.index > last) segments.push(plain(input.slice(last, m.index)))
    segments.push(
      m[1] !== undefined
        ? { text: m[1], hira: toHira(m[1]), half: true, skip: false }
        : { text: m[2], hira: m[2], half: false, skip: true }
    )
    last = m.index + m[0].length
  }
  if (last < input.length) segments.push(plain(input.slice(last)))
  const stray = segments.find(
    (s) => !s.half && !s.skip && BRACKETS.test(s.text)
  )
  if (stray)
    throw new Error(
      `記法の括弧が閉じていない / 中身がひらがなでない / 廃止した [ ] 記法: "${input}"`
    )
  return segments
}
