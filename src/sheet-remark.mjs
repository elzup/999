import { readFileSync } from 'node:fs'
import { encode } from './encoder.js'
import {
  SINGLE_DIGIT,
  normalizeDakuten,
  kataToHira,
  normalizeSmallVowel,
} from './table.js'
import { extractName, isKanaOnly, normalizeForCompare } from './words.js'
import { batchUpdateValues } from './google-sheets.js'

const ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const T = '999'
const DO_WRITE = process.argv.includes('--write')

// --- 母音マップ ---
const ROWS = {
  a: 'あかさたなはまやらわがざだばぱ',
  i: 'いきしちにひみりぎじぢびぴ',
  u: 'うくすつぬふむゆるぐずづぶぷ',
  e: 'えけせてねへめれげぜでべぺ',
  o: 'おこそとのほもよろをごぞどぼぽ',
}
const VOWEL_OF = {}
for (const [v, chars] of Object.entries(ROWS)) for (const c of chars) VOWEL_OF[c] = v
const VOWEL_CHAR = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' }

const colName = (i0) => { let n = i0 + 1, s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const colIdx = (l) => { let n = 0; for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1 }
/** check セル a1 (例 G4) → 隣の kana セル a1 (例 H4) */
const kanaA1 = (a1) => { const m = /^([A-Z]+)(\d+)$/.exec(a1); return `${colName(colIdx(m[1]) + 1)}${m[2]}` }

const norm = (ch) => normalizeSmallVowel(kataToHira(normalizeDakuten(ch)))
const match = (d, n) =>
  d === n ||
  (d.length < n.length && n.endsWith(d) && /^0+$/.test(n.slice(0, n.length - d.length)))

/** 全文字を単字 SINGLE_DIGIT で引く（さん等の貪欲マッチ誤検知検出用） */
function singleDigits(wk) {
  let out = ''
  for (const ch of wk) {
    const d = SINGLE_DIGIT[norm(ch)]
    if (d === undefined) return null
    out += d
  }
  return out
}

/** 長音再エンコード: 各モーラの後に「手前の母音」を1つ挿入して num に一致するか */
function longVowelRescue(wk, num) {
  const chars = [...wk]
  const morae = []
  for (const ch of chars) {
    const c = norm(ch)
    const d = SINGLE_DIGIT[c]
    const v = VOWEL_OF[c]
    if (d === undefined || !v) return false
    morae.push({ d, v })
  }
  const base = morae.map((m) => m.d).join('')
  if (match(base, num)) return true // 素で一致（＝さん系以外の単字一致）
  for (let i = 0; i < morae.length; i++) {
    const insV = SINGLE_DIGIT[VOWEL_CHAR[morae[i].v]]
    const cand = morae.slice(0, i + 1).map((m) => m.d).join('') + insV + morae.slice(i + 1).map((m) => m.d).join('')
    if (match(cand, num)) return true
  }
  return false
}

function digitBad(wk, num) {
  let digits
  try {
    digits = encode(wk).digits
  } catch {
    return true // エンコード不能
  }
  if (match(digits, num)) return false
  if (digits.length > num.length) return false // 桁超過(long) は除外
  return true
}

const readBad = (word, wk) => {
  const name = extractName(word)
  if (!wk || !isKanaOnly(name)) return false
  const nn = normalizeForCompare(name)
  const nw = normalizeForCompare(wk)
  return nn && nw && nn[0] !== nw[0]
}
const sokuon3 = (wk) => {
  const c = [...wk][2]
  return c === 'っ' || c === 'ッ'
}

// --- 再鑑定 ---
const { markCells } = JSON.parse(readFileSync(new URL('./sheet-audit.out.json', import.meta.url), 'utf8'))

const MARK = { missing: '[m]', digit: '[x]', read: '[b]', sokuon3: '[t]' }
const writes = []
const tally = { missing: 0, digit: 0, read: 0, sokuon3: 0, excluded: 0 }
const rescued = []

for (const c of markCells) {
  const { num, slot, word, wk } = c
  let flag = null
  if (word && !wk) flag = 'missing'
  else {
    const dBad = digitBad(wk, num)
    const rescuedByLV = dBad && (singleDigits(wk) && match(singleDigits(wk), num) ? true : longVowelRescue(wk, num))
    const digitError = dBad && !rescuedByLV
    if (dBad && rescuedByLV) rescued.push(c)
    if (digitError) flag = 'digit'
    else if (readBad(word, wk)) flag = 'read'
    else if (sokuon3(wk)) flag = 'sokuon3'
  }
  const marker = flag ? MARK[flag] : ''
  if (flag) tally[flag]++
  else tally.excluded++
  writes.push({ range: `${T}!${kanaA1(c.a1)}`, value: (wk || '') + marker, num, slot, flag, wk })
}

console.log('=== 再鑑定 tally ===', JSON.stringify(tally))
console.log('長音再エンコードで救済:', rescued.length)
for (const c of rescued) console.log('  救済', c.num, c.slot, c.wk, '(', c.word, ')')
console.log('\nマーカー別サンプル:')
for (const f of ['read', 'sokuon3', 'missing']) {
  const s = writes.filter((w) => w.flag === f).slice(0, 6)
  console.log(` ${MARK[f] || f}:`, s.map((w) => `${w.num}${w.slot}=${w.value}`).join(' '))
}

if (!DO_WRITE) {
  console.log('\n(dry-run) --write で書き込み')
} else {
  const data = writes.map((w) => ({ range: w.range, values: [[w.value]] }))
  const res = await batchUpdateValues({ spreadsheetId: ID, data, valueInputOption: 'RAW' })
  console.log('\n書込 updatedCells:', res.totalUpdatedCells)
}
