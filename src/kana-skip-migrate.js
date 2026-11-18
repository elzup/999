// 読まないかなを記法 ( ) で書く (nr kana:skip の規則)。3 種類ある。
//
//   middle  rankey が «1 文字飛ばせば番号に合う» を自動で探して ! を付けていたよみ
//           さばんな → さば(ん)な (どのかなを読まないかをよみに残す)
//   tail    3 桁を超えて読まない語尾 (rankey の余り)
//           にいさん → にいさ(ん)
//   restore よみから読まないかなを消してあるもの。語 (かなだけの語) と突き合わせて戻す
//           サバンナ / さばな → さば(ん)な、ミッキー / みっき → みっき(ー)
//
// middle と tail は rankey が変わらないものだけ、restore は読む数字が変わらないものだけを候補にする
// (どれも読み方を変えない置き換え)。記法がもう付いているよみは触らない。

import { SLOT_KEYS } from './sheet-layout.js'
import { KANA_CELL_PATTERN, hasNotation } from './kana-notation.js'
import { findOmission, rankey } from './rankey.js'
import { score } from './scorer.js'
import { extractName, isKanaOnly, toHiragana } from './words.js'

const KANA_CELL = new RegExp(KANA_CELL_PATTERN)
/** ( ) で囲めるかな (記法の正本と同じ) */
const SKIPPABLE = /^[ぁ-ゖー]+$/

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

/** 読まないかなの並びを ( ) で囲む。( ) に入るのは 2 文字までなので分ける (ちゃん → (ちゃ)(ん)) */
function wrapSkip(run) {
  const chars = [...run]
  const groups = []
  for (let i = 0; i < chars.length; i += 2)
    groups.push(`(${chars.slice(i, i + 2).join('')})`)
  return groups.join('')
}

const digitsOf = (kana) => {
  try {
    return score(kana).digits
  } catch {
    return null
  }
}

/** 対象のよみか (空・記法付き・3 桁でない番号は触らない) */
const isTarget = (reading, num) =>
  Boolean(reading) && !hasNotation(reading) && /^\d{3}$/.test(text(num))

/**
 * 自動で中間省略と判定されるよみを、記法 ( ) で書いたよみにする。対象外なら null
 * @param {string} kana よみ
 * @param {string} num  3 桁の番号
 */
export function skipNotationFor(kana, num) {
  const reading = text(kana)
  if (!isTarget(reading, num)) return null
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
 * 3 桁を超えて読まない語尾を ( ) で囲んだよみにする (にいさん → にいさ(ん))。対象外なら null
 */
export function tailSkipFor(kana, num) {
  const reading = text(kana)
  if (!isTarget(reading, num)) return null
  let tokens
  try {
    tokens = score(reading).tokens
  } catch {
    return null
  }
  const firstOver = tokens.findIndex((t) => t.type === 'overflow')
  if (
    firstOver < 0 ||
    tokens.slice(firstOver).some((t) => t.type !== 'overflow')
  )
    return null
  const tail = tokens
    .slice(firstOver)
    .map((t) => t.kana)
    .join('')
  if (!SKIPPABLE.test(tail) || !reading.endsWith(tail)) return null
  const next = reading.slice(0, reading.length - tail.length) + wrapSkip(tail)
  if (!KANA_CELL.test(next)) return null
  return rankey(next, num) === rankey(reading, num) ? next : null
}

/**
 * よみから消してある読まないかなを、語 (かなだけの語) と突き合わせて ( ) で戻す。
 * サバンナ / さばな → さば(ん)な。読む数字が変わるもの・突き合わせられないものは null
 */
export function restoreSkipFor(word, kana, num) {
  const reading = text(kana)
  if (!isTarget(reading, num)) return null
  const name = extractName(text(word))
  if (!name || !isKanaOnly(name) || name.includes('・')) return null
  const full = [...toHiragana(name)]
  const read = [...reading]
  if (full.join('') === reading || full[0] !== read[0]) return null
  // よみの字を語の頭から順に拾い、拾えなかった語の字を読まないかなとする
  let at = 0
  let run = ''
  let next = ''
  for (const ch of full) {
    if (at < read.length && ch === read[at]) {
      if (run) next += wrapSkip(run)
      run = ''
      next += ch
      at++
    } else {
      run += ch
    }
  }
  if (at < read.length) return null // よみに語に無い字がある
  if (run) next += wrapSkip(run)
  if (!SKIPPABLE.test(full.join('')) || !KANA_CELL.test(next)) return null
  const before = digitsOf(reading)
  return before !== null && digitsOf(next) === before ? next : null
}

/**
 * 1 枠のよみの置き換え。語と突き合わせる restore を先に見る (語にある字を戻すのがいちばん情報が多い)
 * @returns {{ kind: 'restore' | 'middle' | 'tail', to: string } | null}
 */
export function skipRewriteFor(word, kana, num) {
  const restored = restoreSkipFor(word, kana, num)
  if (restored) return { kind: 'restore', to: restored }
  const middle = skipNotationFor(kana, num)
  if (middle) return { kind: 'middle', to: middle }
  const tail = tailSkipFor(kana, num)
  if (tail) return { kind: 'tail', to: tail }
  return null
}

/**
 * DB の番号文書 1 件の置き換え。変えるものが無ければ null
 * @returns {{next: object, changes: {slot, kind, word, from, to}[]} | null}
 */
export function migrateKanaSkipInDoc(doc) {
  const num = text(doc?.num)
  const changes = []
  const slots = { ...doc?.slots }
  for (const slot of SLOT_KEYS) {
    const value = slots[slot]
    const rewrite = skipRewriteFor(value?.word, value?.kana, num)
    if (!rewrite) continue
    const { kind, to } = rewrite
    changes.push({
      slot,
      kind,
      word: text(value.word),
      from: text(value.kana),
      to,
    })
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
 * @returns {{cell, num, slot, kind, before, after}[]}
 */
export function migrateKanaSkipInSheet(values) {
  const header = (values[0] ?? []).map((h) => text(h))
  const numCol = header.indexOf('num') >= 0 ? header.indexOf('num') : 0
  // 語の列の見出しはスロット名 (wh1)、かなの列は wh1k
  const kanaCols = SLOT_KEYS.map((slot) => ({
    slot,
    col: header.indexOf(`${slot}k`),
    wordCol: header.indexOf(slot),
  })).filter(({ col }) => col >= 0)
  const changes = []
  values.slice(1).forEach((row, i) => {
    const num = text(row[numCol])
    for (const { slot, col, wordCol } of kanaCols) {
      const before = text(row[col])
      const word = wordCol >= 0 ? text(row[wordCol]) : ''
      const rewrite = skipRewriteFor(word, before, num)
      if (rewrite)
        changes.push({
          cell: `${columnName(col)}${i + 2}`,
          num,
          slot,
          kind: rewrite.kind,
          before,
          after: rewrite.to,
        })
    }
  })
  return changes
}
