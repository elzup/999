// よみ (かなセル) の記法。仕様は docs/kana-notation.md (D-0093)。書き方は次の 3 つだけ。
//
//   すうる      ひらがな   対応表どおりに読む
//   スうる=376  カタカナ   2 桁を読むかな (す=33) を 1 桁目だけで読む (半指定)
//   さばﾝな     半角カナ   数字にしないかな (読まないかな)
//
// 1 つの読み方に書き方を 1 通りにする。括弧などの囲みを使わないのは、囲みの中身の書き方
// (かな / 数字 / 桁数) で意味を分けると見分けが付かなくなるから。字の種類だけで意味が決まる。
// 数字を自由に書ける記法にしないのは、誤ったよみまで記号 1 つで通ってしまうから。
// 半指定は カタカナ 1 字 (+ 小書き / ー) で 1 トークン: ツ / チャ / キー。
// 半角カナは続けて書いてよい (きすﾏｰｸ)。濁点は半角の ﾞ ﾟ を続ける (ｺﾞ)。
// シートの見直しマーカー ([x] [b] 等) は英字で、かなセルには書かない。
//
// このモジュールは Function からも読む (encoder 経由)。fs 依存を持ち込まないこと。

const KATA = 'ァ-ヶ'
const HANKAKU = 'ｦ-ﾟ'
const HALF_SOURCE = `[${KATA}][ァィゥェォャュョー]?`
const SKIP_SOURCE = `[${HANKAKU}]+`
const NOTATION = new RegExp(`(${HALF_SOURCE})|(${SKIP_SOURCE})`, 'g')
const MARKS = new RegExp(`[${KATA}${HANKAKU}]`)
// 括弧・英数字は記法に無い字 (旧記法 (ん) [す] の残りを読めないよみにする)。地のかなの読めない字は encoder が弾く
const STRAY = /[\x00-\x7f（）［］]/

/** シートの check 列 (REGEXMATCH) と同じ «かなセルとして正しい形» */
export const KANA_CELL_PATTERN = `^([ぁ-ゖ]|${HALF_SOURCE}|[${HANKAKU}])+$`

/** カタカナ → ひらがな (ヴ など対応の無い字はそのまま) */
const toHira = (text) =>
  text.replace(/[ァ-ヶ]/g, (ch) =>
    ch === 'ヵ' || ch === 'ヶ' || ch === 'ヴ'
      ? ch
      : String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )

/** 半角カナ → ひらがな (ｻﾞ → ざ, ｰ → ー) */
const hankakuToHira = (text) => toHira(text.normalize('NFKC'))

const FULL =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョー'
const HALF = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮｰ'
const TO_HANKAKU = new Map([
  ...[...FULL].map((ch, i) => [ch, HALF[i]]),
  ['゙', 'ﾞ'],
  ['゚', 'ﾟ'],
])

/** ひらがな → 読まないかなの書き方 (半角カナ)。ざ → ｻﾞ。半角に無い字 (ゎ など) はそのまま */
export const toSkipKana = (hira) =>
  [...toKata(hira).normalize('NFD')]
    .map((ch) => TO_HANKAKU.get(ch) ?? ch)
    .join('')

const toKata = (s) =>
  s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))

export const hasNotation = (kana) => MARKS.test(String(kana ?? ''))

/** 記号を外したひらがなのかな (語との突き合わせ用)。半指定も読まないかなもひらがなにして残す */
export const stripNotation = (kana) => hankakuToHira(String(kana ?? ''))

/** 読むかなだけのひらがな (読まないかなを落とす)。語尾の一致などを見る用 */
export const readPart = (kana) =>
  toHira(String(kana ?? '').replace(new RegExp(SKIP_SOURCE, 'g'), ''))

/**
 * よみを 地のかな / 半指定 / 読まない の区間に分ける。
 * text は書かれたままの字 (半指定はカタカナ、読まないかなは半角カナ)。hira は読むときのひらがな。
 * 括弧・英数字 があれば throw (読めないよみとして扱わせる)。
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
        : { text: m[2], hira: hankakuToHira(m[2]), half: false, skip: true }
    )
    last = m.index + m[0].length
  }
  if (last < input.length) segments.push(plain(input.slice(last)))
  const stray = segments.find((s) => !s.half && !s.skip && STRAY.test(s.text))
  if (stray)
    throw new Error(
      `よみに括弧・英数字がある (記法はひらがな / カタカナ / 半角カナだけ): "${input}"`
    )
  return segments
}
