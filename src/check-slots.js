import { encode } from './encoder.js'
import {
  loadWords,
  extractName,
  isKanaOnly,
  normalizeForCompare,
} from './words.js'

import { SLOT_KEYS } from './sheet-layout.js'
import { findOmission } from './rankey.js'
import { hasNotation, stripNotation } from './kana-notation.js'

/**
 * よみが番号に合うか。rankey と同じ規則で許す:
 *   3 桁を超えた分は余り (ひるま = 160|0) / 先頭 0 の省略 (れい = 01) / 中間 1 文字の省略 (りんご)
 * 記法 ス (カタカナ) の半指定は encode が digits に反映済み
 */
function readingMatchesNum(kana, digits, num) {
  if (digits.startsWith(num)) return true
  if (!hasNotation(kana) && findOmission(kana, num) >= 0) return true
  return digitsMatchNum(digits, num)
}

/** num の末尾と digits が桁省略 (leading-zero omission) も含めて一致するか */
function digitsMatchNum(digits, num) {
  if (digits === num) return true
  // 桁省略: 先頭 0 を省いた短い読み (例 num=012, digits=12)
  if (digits.length < num.length && num.endsWith(digits)) {
    return /^0+/.test(num.slice(0, num.length - digits.length))
  }
  return false
}

/** wk が w の読みとして「明らかに誤り」か (先頭かな不一致) */
function kanaDefinitelyWrong(word, wk) {
  const name = extractName(word)
  if (!name || !wk) return null
  if (!isKanaOnly(name)) return null // 漢字混じりは読み照合できないのでスキップ
  const normName = normalizeForCompare(name)
  const normWk = normalizeForCompare(stripNotation(wk))
  if (!normName || !normWk) return null
  if (normName[0] === normWk[0]) return null
  return { name, normName, normWk }
}

const entries = loadWords()

const digitErrors = [] // かな→数字エンコード不能 or 数字不一致
const kanaErrors = [] // wk が w の読みになっていない (先頭不一致)
const missingKana = [] // 語句はあるが かな が空

for (const entry of entries) {
  for (const slot of SLOT_KEYS) {
    const word = entry[slot]
    const wk = entry[`${slot}k`]
    if (!word) continue // 語句が無いスロットは対象外

    // --- Check A: 語句に対し かな が存在するか ---
    if (!wk) {
      missingKana.push({ num: entry.num, slot, word })
      continue
    }

    // --- Check B: かな ⇄ 数字 の対応 ---
    try {
      const { digits } = encode(wk)
      if (!readingMatchesNum(wk, digits, entry.num)) {
        digitErrors.push({
          num: entry.num,
          slot,
          wk,
          digits,
          kind: 'mismatch',
        })
      }
    } catch (e) {
      digitErrors.push({
        num: entry.num,
        slot,
        wk,
        digits: '-',
        kind: 'unencodable',
        msg: e.message,
      })
    }

    // --- Check C: wk が w の読みになっているか ---
    const wrong = kanaDefinitelyWrong(word, wk)
    if (wrong) {
      kanaErrors.push({
        num: entry.num,
        slot,
        word,
        normName: wrong.normName,
        wk,
      })
    }
  }
}

function section(title, rows, fmt) {
  console.log(`\n=== ${title} (${rows.length}) ===`)
  for (const r of rows) console.log('  ' + fmt(r))
}

section('数字⇄かな 不一致 / エンコード不能', digitErrors, (r) =>
  r.kind === 'unencodable'
    ? `${r.num} ${r.slot}: "${r.wk}" → エンコード不能 (${r.msg})`
    : `${r.num} ${r.slot}: "${r.wk}" → ${r.digits} (期待 ${r.num})`
)

section(
  'かなが語句の読みになっていない (先頭不一致)',
  kanaErrors,
  (r) => `${r.num} ${r.slot}: ${r.word} → 読み"${r.normName}" ≠ かな"${r.wk}"`
)

section(
  '語句はあるが かな が空',
  missingKana,
  (r) => `${r.num} ${r.slot}: ${r.word}`
)

console.log(
  `\n--- 合計: 数字不一致 ${digitErrors.length} / 読み不一致 ${kanaErrors.length} / かな欠落 ${missingKana.length} ---`
)
