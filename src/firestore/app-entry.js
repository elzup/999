// Firestore の番号文書を、配信データ (private/data.json) の番号 1 件 (NumberEntry) に重ねる。
//
// 配信データは nr deploy のときに words.tsv から焼くので、アプリやシートで直した語は
// 次の deploy まで一覧・詳細・テストに出なかった。/api/app/data が返す前にここで重ねる。
//
// 重ねるのは語・かな (6 スロット) と、そこから決まる人/物の一覧・スコアだけ。
// 画像は枠の位置 (w1 / w2 ...) に付いていて語とは別の経路 (imageSlots) なので触らない。
// ga (割当グラフ) と yomiUse は全体の集計なので deploy のときに作り直す。
//
// このモジュールは Function からも読み込む (scripts/sync-functions-lib.sh)。

import { SLOT_KEYS } from '../sheet-layout.js'
import { sheetFormOfDoc } from './sheet-bisync.js'
import { categoryScore, normalizeWordEntry } from '../words.js'
import { scoreFields } from '../entry-score.js'

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

// 端末でも同じ計算を使うため entry-score.js へ移した
export { tokenLabel, scoreFields } from '../entry-score.js'

const slotOf = (doc, slot) => ({
  word: text(doc?.slots?.[slot]?.word),
  kana: text(doc?.slots?.[slot]?.kana),
})

/** 配信データにもう文書の語・かなが入っているか (入っていれば重ねない) */
export function isDocReflected(entry, doc) {
  return SLOT_KEYS.every((slot) => {
    const { word, kana } = slotOf(doc, slot)
    return text(entry?.[slot]) === word && text(entry?.[`${slot}k`]) === kana
  })
}

const isImageField = (key) => key.endsWith('Img')

/**
 * 配信データの 1 件に、DB の文書の語・かなを重ねた 1 件を返す。入力は書き換えない。
 * 文書の語・かながもう入っていれば、同じ 1 件をそのまま返す
 */
export function entryWithDoc(entry, doc) {
  if (!doc?.slots || isDocReflected(entry, doc)) return entry
  // 人/物の一覧は 1〜3 番目をスロットから、4 番目以降を文書の一覧から取る (シートの列と同じ形)
  const form = sheetFormOfDoc(doc)
  const raw = {
    num: entry.num,
    hito: form.hito,
    mono: form.mono,
    gainen: text(doc.gainen),
  }
  for (const slot of SLOT_KEYS) {
    const { word, kana } = slotOf(doc, slot)
    raw[slot] = word
    raw[`${slot}k`] = kana
  }
  const base = normalizeWordEntry(raw)
  const words = Object.fromEntries(
    Object.entries(base).filter(([key]) => !isImageField(key))
  )
  return {
    ...entry,
    ...words,
    ...categoryScore(base),
    ...scoreFields(base),
  }
}

/**
 * 配信データの numbers 全体に文書を重ねる。変わった件数も返す
 * @param {object[]} numbers  配信データの numbers
 * @param {Record<string, object>} docsByNum  番号 → 文書
 */
export function numbersWithDocs(numbers, docsByNum) {
  let changed = 0
  const next = numbers.map((entry) => {
    const merged = entryWithDoc(entry, docsByNum[entry.num])
    if (merged !== entry) changed++
    return merged
  })
  return { numbers: next, changed }
}
