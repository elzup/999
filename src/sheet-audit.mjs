import {
  batchUpdateValues,
  getSheetTitleByGid,
  getSheetValuesByTitle,
} from './google-sheets.js'
import { rankey } from './rankey.js'
import { encode } from './encoder.js'
import { extractName, isKanaOnly, normalizeForCompare } from './words.js'

const ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const DO_WRITE = process.argv.includes('--write-rankey')
// 旧 pt 列を rankey に置き換える。ヘッダも合わせて書き換える。
const KEY_HEADER = 'rankey'
const KEY_HEADER_OLD = 'pt'

function colName(i0) {
  let n = i0 + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function digitsMatchNum(digits, num) {
  if (digits === num) return true
  if (digits.length < num.length && num.endsWith(digits)) {
    return /^0+$/.test(num.slice(0, num.length - digits.length))
  }
  return false
}

const title = await getSheetTitleByGid(ID, '0')
const rows = await getSheetValuesByTitle({ spreadsheetId: ID, title })
const header = rows[0]

// k 列を検出し、slot ブロック { word, check, k, pt } を構築
const slots = []
header.forEach((h, i) => {
  const m = /^(w[hm]\d)k$/.exec(h)
  if (m)
    slots.push({
      slot: m[1],
      wordCol: header.indexOf(m[1]),
      checkCol: i - 1,
      kCol: i,
      ptCol: i + 1,
    })
})
// 妥当性チェック
for (const s of slots) {
  const keyHeader = (header[s.ptCol] || '').trim()
  const okKey = keyHeader === KEY_HEADER || keyHeader === KEY_HEADER_OLD
  if (header[s.checkCol] !== 'check' || !okKey || s.wordCol < 0) {
    throw new Error(
      `slot ${s.slot} 列構造が想定外: ${JSON.stringify(s)} / ${
        header[s.checkCol]
      },${keyHeader}`
    )
  }
}
// pt のままの列は rankey へ改名する (値の意味が変わるため)
const headerCells = slots
  .filter((s) => (header[s.ptCol] || '').trim() === KEY_HEADER_OLD)
  .map((s) => ({ a1: `${colName(s.ptCol)}1`, value: KEY_HEADER }))
console.log(
  'slots:',
  slots
    .map(
      (s) =>
        `${s.slot}[w${colName(s.wordCol)} c${colName(s.checkCol)} k${colName(
          s.kCol
        )} p${colName(s.ptCol)}]`
    )
    .join(' ')
)

const cat = { read: 0, missing: 0, digit: 0, sokuon3: 0 }
const markCells = [] // [x] を入れる check セル
const ptCells = [] // score を入れる pt セル
let ptSkipFilled = 0
let markSkipFilled = 0
let kanaTotal = 0

for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  const num = (row[0] || '').trim()
  if (!/^\d{3}$/.test(num)) continue
  const sheetRow = r + 1 // 1-indexed, header は row1

  for (const s of slots) {
    const word = (row[s.wordCol] || '').trim()
    const wk = (row[s.kCol] || '').trim()
    const checkCur = (row[s.checkCol] || '').trim()
    const ptCur = (row[s.ptCol] || '').trim()

    // --- rankey: かながあれば内訳記法を入れる (旧 pt 列を置き換え) ---
    if (wk) {
      kanaTotal++
      const key = rankey(wk, num, word) ?? 'ERR'
      if (ptCur === key) ptSkipFilled++
      else ptCells.push({ a1: `${colName(s.ptCol)}${sheetRow}`, value: key })
    }

    // --- check [x] 判定 ---
    if (!word) continue
    let flag = null
    if (!wk) {
      flag = 'missing'
    } else {
      // digit mismatch (long は除外)
      let bad = false
      try {
        const { digits } = encode(wk)
        if (!digitsMatchNum(digits, num) && digits.length <= num.length)
          bad = true
      } catch {
        bad = true // unencodable
      }
      if (bad) flag = 'digit'
      // read mismatch
      const name = extractName(word)
      if (isKanaOnly(name)) {
        const nn = normalizeForCompare(name)
        const nw = normalizeForCompare(wk)
        if (nn && nw && nn[0] !== nw[0]) flag = flag || 'read'
      }
      // 3文字目が促音
      const chars = [...wk]
      if (chars[2] === 'っ' || chars[2] === 'ッ') flag = flag || 'sokuon3'
    }
    if (!flag) continue
    cat[
      flag === 'missing'
        ? 'missing'
        : flag === 'digit'
        ? 'digit'
        : flag === 'read'
        ? 'read'
        : 'sokuon3'
    ]++
    if (checkCur.includes('[x]')) {
      markSkipFilled++
      continue
    }
    markCells.push({
      a1: `${colName(s.checkCol)}${sheetRow}`,
      value: (checkCur ? checkCur + ' ' : '') + '[x]',
      num,
      slot: s.slot,
      flag,
      word,
      wk,
    })
  }
}

console.log('\n--- rankey ---')
console.log(
  'かなセル総数:',
  kanaTotal,
  '/ 書込対象:',
  ptCells.length,
  '/ 既に一致:',
  ptSkipFilled
)
console.log(
  'ERR(エンコード不能):',
  ptCells.filter((c) => c.value === 'ERR').length
)
console.log('ヘッダ改名 (pt -> rankey):', headerCells.length, '列')

console.log('\n--- check [x] ---')
console.log('カテゴリ内訳(重複あり):', JSON.stringify(cat))
console.log(
  '書込対象セル(dedup):',
  markCells.length,
  '/ 既に[x]あり:',
  markSkipFilled
)
const byFlag = {}
for (const c of markCells) byFlag[c.flag] = (byFlag[c.flag] || 0) + 1
console.log('採用flag別:', JSON.stringify(byFlag))
console.log('\nサンプル(先頭15):')
for (const c of markCells.slice(0, 15))
  console.log(
    `  ${c.a1} ${c.num} ${c.slot} [${c.flag}] ${c.word} / かな"${c.wk}"`
  )

import { writeFileSync } from 'node:fs'
writeFileSync(
  new URL('./sheet-audit.out.json', import.meta.url),
  JSON.stringify({ markCells, ptCells, headerCells }, null, 0)
)
console.log('\n書込プラン → src/sheet-audit.out.json')

if (DO_WRITE) {
  const data = [...headerCells, ...ptCells].map((c) => ({
    range: `${title}!${c.a1}`,
    values: [[c.value]],
  }))
  if (data.length === 0) {
    console.log('rankey 書込: 差分なし (シートは最新)')
  } else {
    const res = await batchUpdateValues({ spreadsheetId: ID, data })
    console.log('rankey 書込 updatedCells:', res.totalUpdatedCells)
  }
} else {
  console.log('(dry-run) --write-rankey で rankey のみ書き込み')
}
