// シート ⇄ Firestore の双方向同期のうち、I/O を持たない計算部分。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// 比較は «シートで人が編集できる 8 セル» の形 (sheet form) で行う。
// DB の slots と シートの列は 1:1 ではない (語セルは 人/物 一覧から式で取り出している)
// ので、どちらかの形に寄せないと 3-way の base が定義できないため。
//
// このモジュールは Function からも読み込む。fs 依存を持ち込まないこと。

import { canonicalJson } from './number-doc.js'

/** スロットの並び。人 (wh) と 物 (wm) がそれぞれ一覧の 1〜3 番目に対応する */
const GROUPS = {
  hito: ['wh1', 'wh2', 'wh3'],
  mono: ['wm1', 'wm2', 'wm3'],
}
const KANA_FIELDS = [...GROUPS.hito, ...GROUPS.mono].map((slot) => `${slot}k`)
export const SHEET_FIELDS = ['hito', 'mono', ...KANA_FIELDS]

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

/** 一覧セルの項目。空要素も位置として残す (中抜けの語を潰さないため) */
function itemsOf(list) {
  const raw = text(list)
  return raw === '' ? [] : raw.split(',').map((item) => item.trim())
}

/** 末尾の空要素だけ落として連結する。«A,» と «A» を同じ値として扱うため */
function joinItems(items) {
  const trimmed = [...items]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return trimmed.join(',')
}

const normalizeList = (list) => joinItems(itemsOf(list))

/** セル 1 つを比較用の値にする。書く直前の読み直しでも同じ規則で比べる */
export function normalizeCell(field, value) {
  return field === 'hito' || field === 'mono'
    ? normalizeList(value)
    : text(value)
}

/** シートの 1 行 (sheet-io が返す cells) を比較用の形にする */
export function sheetFormOfRow(cells) {
  return Object.fromEntries(
    SHEET_FIELDS.map((field) => [field, normalizeCell(field, cells[field])])
  )
}

/**
 * スロット 3 つを一覧の先頭 3 項目に戻す。語もかなも無い枠は詰める。
 * 詰めないと «A,,C» を書くことになり、PICK_FIRST の数え方次第で
 * かなと語の対応がずれる。
 */
function packGroup(slots, keys) {
  const filled = keys
    .map((slot) => slots?.[slot])
    .filter((value) => text(value?.word) !== '' || text(value?.kana) !== '')
  return keys.map((_, i) => ({
    word: text(filled[i]?.word),
    kana: text(filled[i]?.kana),
  }))
}

/**
 * DB の文書を比較用の形にする。
 * アプリの語編集は slots だけを書き hito / mono を更新しないので、
 * 1〜3 番目は slots から、4 番目以降だけを hito / mono から取る。
 */
export function sheetFormOfDoc(doc) {
  const form = {}
  for (const [group, keys] of Object.entries(GROUPS)) {
    const packed = packGroup(doc?.slots, keys)
    const extras = itemsOf(doc?.[group]).slice(keys.length)
    form[group] = joinItems([...packed.map((p) => p.word), ...extras])
    keys.forEach((slot, i) => {
      form[`${slot}k`] = packed[i].kana
    })
  }
  return Object.fromEntries(SHEET_FIELDS.map((field) => [field, form[field]]))
}

/** 語に付いている画像などを、その語の新しい位置へ持っていくための索引 */
function extrasByWord(slots, keys) {
  const found = new Map()
  for (const slot of keys) {
    const value = slots?.[slot]
    const word = text(value?.word)
    if (!value || word === '' || found.has(word)) continue
    const { word: _word, kana: _kana, ...extras } = value
    found.set(word, extras)
  }
  return found
}

/**
 * 比較用の形から DB の文書を組み立て直す。
 * rep / ratings / derived 以外の既存フィールドはそのまま引き継ぐ。
 */
export function docFromSheetForm(current, form, { now, source = 'sheet' }) {
  const slots = {}
  for (const [group, keys] of Object.entries(GROUPS)) {
    const items = itemsOf(form[group])
    const extras = extrasByWord(current?.slots, keys)
    keys.forEach((slot, i) => {
      const word = items[i] ?? ''
      const kana = text(form[`${slot}k`])
      if (word === '' && kana === '') return
      slots[slot] = { imageUrl: '', ...extras.get(word), word, kana }
    })
  }
  const next = {
    ...current,
    hito: form.hito,
    mono: form.mono,
    slots,
    updatedAt: now,
    source,
  }
  delete next.derived // サーバ所有。writeNumber が付け直す
  return next
}

/** DB の文書を書き直す必要があるか (slots と一覧フィールドだけを見る) */
function needsDbWrite(current, next) {
  if (canonicalJson(current?.slots ?? {}) !== canonicalJson(next.slots)) {
    return true
  }
  return ['hito', 'mono'].some(
    (field) => normalizeList(current?.[field]) !== next[field]
  )
}

/**
 * 1 セル分の 3-way。戻り値の value が undefined なら衝突。
 * base が無いのは初回だけで、そのときは bootstrapSide の値を採る。
 */
function mergeCell({ sheet, db, base, bootstrapSide }) {
  if (sheet === db) return { value: sheet }
  if (base === undefined) {
    return { value: bootstrapSide === 'db' ? db : sheet, bootstrap: true }
  }
  if (sheet === base) return { value: db }
  if (db === base) return { value: sheet }
  return { value: undefined }
}

/**
 * 1 番号分の計画。
 * @returns { sheetCells, dbDoc, nextBase, conflicts, bootstrapped }
 *   sheetCells: シートへ書くセル { field: value }
 *   dbDoc:      DB へ書く文書 (書かなくてよければ null)
 *   nextBase:   両側が揃ったら採る base (書き込みが全部通ったときだけ保存する)
 */
export function planNumber({ sheetForm, doc, base, now }) {
  const dbForm = sheetFormOfDoc(doc)
  // アプリが最後に書いた文書は、初回の判定で DB を正とする (REQ-BI-009)
  const bootstrapSide = doc?.source === 'app' ? 'db' : 'sheet'

  const sheetTarget = {}
  const dbTarget = {}
  const nextBase = {}
  const conflicts = []
  const bootstrapped = []

  for (const field of SHEET_FIELDS) {
    const merged = mergeCell({
      sheet: sheetForm[field],
      db: dbForm[field],
      base: base?.[field],
      bootstrapSide,
    })
    if (merged.value === undefined) {
      conflicts.push({
        field,
        sheet: sheetForm[field],
        db: dbForm[field],
        base: base[field],
      })
      sheetTarget[field] = sheetForm[field]
      dbTarget[field] = dbForm[field]
      nextBase[field] = base[field]
      continue
    }
    if (merged.bootstrap) {
      bootstrapped.push({
        field,
        sheet: sheetForm[field],
        db: dbForm[field],
        chosen: bootstrapSide,
      })
    }
    sheetTarget[field] = merged.value
    dbTarget[field] = merged.value
    nextBase[field] = merged.value
  }

  const sheetCells = Object.fromEntries(
    SHEET_FIELDS.filter((f) => sheetTarget[f] !== sheetForm[f]).map((f) => [
      f,
      sheetTarget[f],
    ])
  )
  const next = docFromSheetForm(doc, dbTarget, { now })
  const dbDoc = needsDbWrite(doc, next) ? next : null

  return { sheetCells, dbDoc, nextBase, conflicts, bootstrapped }
}

/** base と同じか。base が無ければ «変わった» として扱う */
export function sameAsBase(form, base) {
  if (!base) return false
  return SHEET_FIELDS.every((field) => form[field] === base[field])
}
