// シートの «管理フォーマット» (999 / 1231 タブの列構成) の正本。
//
//   num | 人 | 物 | ng | _ | (word | check | k | rankey) × 6 スロット
//
// スロット順は wh1, wm1, wh2, wm2, wh3, wm3。word 列は人/物セルの n 番目を
// PICK_FIRST で引き、check 列は «語とかなの片方だけ埋まっている / かなが
// ひらがな以外» のときに "|" を出す。k (かな) と rankey は値の列で式を持たない
// (rankey は sheetSync のついでに Function が書く: D-0052)。
// タブごとに人/物の列位置が違っても、同じ式を組めるように列を引数で受ける。

import { KANA_CELL_PATTERN } from './kana-notation.js'

export const SLOT_ORDER = [
  { key: 'wh1', side: 'hito', nth: 1 },
  { key: 'wm1', side: 'mono', nth: 1 },
  { key: 'wh2', side: 'hito', nth: 2 },
  { key: 'wm2', side: 'mono', nth: 2 },
  { key: 'wh3', side: 'hito', nth: 3 },
  { key: 'wm3', side: 'mono', nth: 3 },
]

/** 人 / 物 ごとのスロット (一覧の 1〜3 番目に対応) */
export const SIDE_SLOTS = {
  hito: SLOT_ORDER.filter((s) => s.side === 'hito').map((s) => s.key),
  mono: SLOT_ORDER.filter((s) => s.side === 'mono').map((s) => s.key),
}

/** 人→物でまとめた並び (wh1, wh2, wh3, wm1, wm2, wm3) */
export const SLOT_KEYS = [...SIDE_SLOTS.hito, ...SIDE_SLOTS.mono]

export const SLOT_FIELDS = ['word', 'check', 'k', 'rankey']

/** 列記号 → 0 始まりの番号 (A → 0, AA → 26) */
export function colIndex(letter) {
  return (
    [...letter.toUpperCase()].reduce(
      (acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64),
      0
    ) - 1
  )
}

/** 0 始まりの番号 → 列記号 */
export function colLetter(index) {
  const rest = Math.floor(index / 26)
  const ch = String.fromCharCode(65 + (index % 26))
  return rest === 0 ? ch : colLetter(rest - 1) + ch
}

/** check 列: 語とかなの片方だけ / かなが «ひらがな + 記法 (カタカナ / 半角カナ)» 以外 のとき "|" */
export function checkFormula(wordCol, kanaCol, row) {
  const w = `${wordCol}${row}`
  const k = `${kanaCol}${row}`
  return `=IF(OR(XOR(${w}="",${k}=""),NOT(OR(${k}="",REGEXMATCH(${k},"${KANA_CELL_PATTERN}")))),"|","")`
}

export function ngFormula(cols, row) {
  return `=AND(${cols.map((c) => `ISBLANK(${c}${row})`).join(',')})`
}

/**
 * スロット 6 個ぶんの列配置。slotStart から 4 列ずつ並べる。
 * @returns {{key, side, nth, word, check, k, rankey}[]} 各フィールドは列記号
 */
export function slotColumns(slotStart) {
  const base = colIndex(slotStart)
  return SLOT_ORDER.map((slot, i) => {
    const at = (offset) => colLetter(base + i * SLOT_FIELDS.length + offset)
    return { ...slot, word: at(0), check: at(1), k: at(2), rankey: at(3) }
  })
}

/**
 * 1 行ぶんの式セル { 列記号: 式 }。値の列 (k / rankey) は含めない。
 * @param {{hito: string, mono: string, slotStart: string, ng?: {col: string, cols: string[]}}} layout
 */
export function rowFormulas(layout, row) {
  const sideCol = { hito: layout.hito, mono: layout.mono }
  const slots = slotColumns(layout.slotStart).flatMap((s) => [
    [s.word, `=PICK_FIRST(${sideCol[s.side]}${row},${s.nth})`],
    [s.check, checkFormula(s.word, s.k, row)],
  ])
  const ng = layout.ng ? [[layout.ng.col, ngFormula(layout.ng.cols, row)]] : []
  return Object.fromEntries([...ng, ...slots])
}

/**
 * check 列の式を 2 行目から lastRow まで書き直す範囲 (Sheets API の batchUpdate の data)。
 * かなの記法を増やしたら、シートの式も正本 (KANA_CELL_PATTERN) に合わせて書き直す
 * @returns {{range: string, values: string[][]}[]}
 */
export function checkColumnUpdates(title, layout, lastRow) {
  const rows = []
  for (let row = 2; row <= lastRow; row++) rows.push(row)
  return slotColumns(layout.slotStart).map((s) => ({
    range: `'${title}'!${s.check}2:${s.check}${lastRow}`,
    values: rows.map((row) => [checkFormula(s.word, s.k, row)]),
  }))
}

/** 見出し行 { 列記号: 見出し } (スロット部分のみ) */
export function slotHeaders(slotStart) {
  return Object.fromEntries(
    slotColumns(slotStart).flatMap((s) => [
      [s.word, s.key],
      [s.check, 'check'],
      [s.k, `${s.key}k`],
      [s.rankey, 'rankey'],
    ])
  )
}

// 999 / 1231 タブの配置。num=A 人=B 物=C ng=D _=E、スロットは F から
export const MAIN_LAYOUT = {
  hito: 'B',
  mono: 'C',
  slotStart: 'F',
  ng: { col: 'D', cols: ['B', 'C'] },
}

// FF タブの配置。A:H (num/hex/type/bin/展開/参照/人/物) は scripts/ff-sheet.mjs が
// A3:H258 で読むので動かさず、I=ng J=_ の後ろ K からスロットを並べる
export const FF_LAYOUT = {
  hito: 'G',
  mono: 'H',
  slotStart: 'K',
  // 参照 (F) も空なら ng
  ng: { col: 'I', cols: ['F', 'G', 'H'] },
}
