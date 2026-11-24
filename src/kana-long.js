// よみから長音の «う» を消してしまった漢字の語の候補を出す (nr kana:long の規則)。
//
//   将棋 しょぎ → しょｳぎ   (しょう の う を読まないかな ｳ で残す)
//
// 漢字の語は読みを機械で引けない (nr kana:skip の restore はかなだけの語しか突き合わせられない) ので、
// お段・ゅ の後ろに ｳ を足しても読む数字が変わらない位置を «候補» として挙げるだけにする。
// 所持 (しょじ) のように本当に う が無い語も混ざるので、書き直しは一覧を見て手で行う。

import { KANA_CELL_PATTERN } from './kana-notation.js'
import { score } from './scorer.js'
import { extractName, isKanaOnly } from './words.js'

const KANA_CELL = new RegExp(KANA_CELL_PATTERN)
/** 後ろに長音の う が来うる字 (お段 + ゅ ょ)。しょう・とう・しゅう など */
const LONG_BEFORE = new Set([...'おこごそぞとどのほぼぽもよょろをゅ'])
/** もう伸ばしてある (う / ｳ / ー / ｰ / お が続く) なら足さない */
const ALREADY_LONG = new Set([...'うｳーｰおｵ'])
const KANJI = /[㐀-鿿々〆]/

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

const digitsOf = (kana) => {
  try {
    return score(kana).digits
  } catch {
    return null
  }
}

/**
 * 1 枠の候補。ｳ を足したよみを位置ごとに返す (無ければ空)。
 * 漢字を含む語だけが対象 (かなだけの語は nr kana:skip の restore が語と突き合わせて戻す)
 * @param {string} word 語
 * @param {string} kana よみ
 * @param {string} num  3 桁の番号
 * @returns {string[]}
 */
export function longVowelCandidates(word, kana, num) {
  const reading = text(kana)
  if (!reading || !/^\d{3}$/.test(text(num))) return []
  const name = extractName(text(word))
  if (!name || isKanaOnly(name) || !KANJI.test(name)) return []
  const before = digitsOf(reading)
  if (before === null) return []
  const chars = [...reading]
  return chars.flatMap((ch, i) => {
    if (!LONG_BEFORE.has(ch) || ALREADY_LONG.has(chars[i + 1])) return []
    const next = [...chars.slice(0, i + 1), 'ｳ', ...chars.slice(i + 1)].join('')
    return KANA_CELL.test(next) && digitsOf(next) === before ? [next] : []
  })
}

/**
 * words.tsv の全枠から候補を集める。prefix を渡すとその番号で始まるものだけ (例 '44')
 * @param {object[]} entries loadWords() の結果
 * @param {string[]} slotKeys 見る枠 (wh1 など。よみの列は `${slot}k`)
 * @returns {{num, slot, word, kana, candidates: string[]}[]}
 */
export function collectLongVowelCandidates(entries, slotKeys, prefix = '') {
  return entries
    .filter((entry) => text(entry.num).startsWith(prefix))
    .flatMap((entry) =>
      slotKeys.flatMap((slot) => {
        const word = text(entry[slot])
        const kana = text(entry[`${slot}k`])
        const candidates = longVowelCandidates(word, kana, entry.num)
        return candidates.length
          ? [{ num: text(entry.num), slot, word, kana, candidates }]
          : []
      })
    )
    .sort((a, b) => a.num.localeCompare(b.num))
}
