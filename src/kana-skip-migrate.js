// よみの中間省略を記法 ( ) で書く (nr kana:skip の規則)。
//
// 記法が無かった頃のよみは、rankey が «1 文字飛ばせば番号に合う» を自動で探して ! を付けていた
// (さばんな = AA!A|)。どのかなを読まないかがよみに残らないので、記法で書き直す (さば(ん)な)。
// 書き直した後も rankey が同じになるものだけを候補にする (読み方を変えない置き換えだけ)。

import { SLOT_KEYS } from './sheet-layout.js'
import { hasNotation } from './kana-notation.js'
import { findOmission, rankey } from './rankey.js'

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

/**
 * 自動で中間省略と判定されるよみを、記法 ( ) で書いたよみにする。対象外なら null
 * @param {string} kana よみ
 * @param {string} num  3 桁の番号
 */
export function skipNotationFor(kana, num) {
  const reading = text(kana)
  if (!reading || hasNotation(reading) || !/^\d{3}$/.test(text(num)))
    return null
  const before = rankey(reading, num)
  if (!before?.includes('!')) return null
  const at = findOmission(reading, num)
  if (at < 0) return null
  const chars = [...reading]
  // 記法で囲めるのはひらがなだけ (シートの check 列と同じ)
  if (!/^[ぁ-ゖ]$/.test(chars[at])) return null
  const next = [
    ...chars.slice(0, at),
    `(${chars[at]})`,
    ...chars.slice(at + 1),
  ].join('')
  return rankey(next, num) === before ? next : null
}

/**
 * DB の番号文書 1 件の置き換え。変えるものが無ければ null
 * @returns {{next: object, changes: {slot, word, from, to}[]} | null}
 */
export function migrateKanaSkipInDoc(doc) {
  const num = text(doc?.num)
  const changes = []
  const slots = { ...doc?.slots }
  for (const slot of SLOT_KEYS) {
    const value = slots[slot]
    const to = skipNotationFor(value?.kana, num)
    if (!to) continue
    changes.push({ slot, word: text(value.word), from: text(value.kana), to })
    slots[slot] = { ...value, kana: to }
  }
  return changes.length ? { next: { ...doc, slots }, changes } : null
}

/** 0 始まりの列番号 → A1 表記の列名 (0 → A, 27 → AB) */
function columnName(index) {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/**
 * シート 1 タブ分の置き換え。values は 1 行目が見出しの 2 次元配列。
 * かなの列 (見出し wh1k など) を書き換える。返すのは変わるセルだけ
 * @returns {{cell, num, slot, before, after}[]}
 */
export function migrateKanaSkipInSheet(values) {
  const header = (values[0] ?? []).map((h) => text(h))
  const numCol = header.indexOf('num') >= 0 ? header.indexOf('num') : 0
  const kanaCols = SLOT_KEYS.map((slot) => ({
    slot,
    col: header.indexOf(`${slot}k`),
  })).filter(({ col }) => col >= 0)
  const changes = []
  values.slice(1).forEach((row, i) => {
    const num = text(row[numCol])
    for (const { slot, col } of kanaCols) {
      const before = text(row[col])
      const after = skipNotationFor(before, num)
      if (after)
        changes.push({
          cell: `${columnName(col)}${i + 2}`,
          num,
          slot,
          before,
          after,
        })
    }
  })
  return changes
}
