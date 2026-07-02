import { encode } from './encoder.js'
import {
  loadWords,
  extractName,
  isKanaOnly,
  normalizeForCompare,
} from './words.js'

const SLOTS = ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3']

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
  const normWk = normalizeForCompare(wk)
  if (!normName || !normWk) return null
  if (normName[0] === normWk[0]) return null
  return { name, normName, normWk }
}

const entries = loadWords()

const digitErrors = [] // かな→数字エンコード不能 or 数字不一致
const kanaErrors = [] // wk が w の読みになっていない (先頭不一致)
const missingKana = [] // 語句はあるが かな が空

for (const entry of entries) {
  for (const slot of SLOTS) {
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
      if (!digitsMatchNum(digits, entry.num)) {
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
