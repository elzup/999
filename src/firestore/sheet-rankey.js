// シートの rankey 列を、かな・番号・語から計算した値に揃える (D-0045, D-0052)。
// rankey は保存する値ではなく、見る場所ごとに計算する。シートは同期のついでに
// Function が書いて揃える «表示先» なので、計算が古いまま残ることがない。
//
// rankey の計算 (src/rankey.js) は規則表を fs で読むので、ここでは import せず
// 呼び出し側から rankeyOf として受け取る。このモジュールは fs に依存しない。

import { KANA_FIELDS } from './sheet-bisync.js'

/** rankey セルを writeCells に渡すときの field 名 (かなの列の右隣) */
export const rankeyField = (kanaField) => `${kanaField}:rankey`
/** 語セルの列 (rankey の «語が読みより長い分» の計算に使う) */
export const wordField = (kanaField) => `${kanaField}:word`

// rankey が計算できない読み (規則表に無い並び) は空欄にせず印を残す。
// 空欄だと «かなが無い» と見分けがつかないため (sheet-audit.mjs と同じ印)
const UNREADABLE = 'ERR'

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

/** この回でシートへ書いたかなを重ねる。書く前の値で計算すると 1 回ぶん遅れる */
function kanaAfterWrites(rows, written) {
  const byNum = new Map()
  for (const w of written) {
    if (!KANA_FIELDS.includes(w.field)) continue
    byNum.set(w.num, { ...byNum.get(w.num), [w.field]: w.value })
  }
  return (row) => ({ ...row.cells, ...byNum.get(row.num) })
}

/**
 * rankey 列のうち、計算値と違うセルだけを書き込み予定にする。
 * かなが空なら rankey も空にする (かなを消したのに古い rankey が残らないように)
 * @param rows     sheet.readRows() の行。rankeys / words を持つ行だけ扱う
 * @param written  この回の writeCells で書けたセル
 * @param rankeyOf (kana, num, word) => string | null
 */
export function planRankeys({ rows, written = [], rankeyOf }) {
  const cellsOf = kanaAfterWrites(rows, written)
  const updates = []
  for (const row of rows) {
    if (!row.rankeys) continue
    const cells = cellsOf(row)
    for (const field of KANA_FIELDS) {
      if (!(field in row.rankeys)) continue
      const kana = text(cells[field])
      const word = text(row.words?.[field])
      const value = kana ? rankeyOf(kana, row.num, word) ?? UNREADABLE : ''
      const current = text(row.rankeys[field])
      if (value === current) continue
      updates.push({
        num: row.num,
        rowNumber: row.rowNumber,
        field: rankeyField(field),
        value,
        expected: current,
      })
    }
  }
  return updates
}
