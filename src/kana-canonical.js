// よみを «1 つの読み方に 1 通りの書き方» (docs/kana-notation.md, D-0092) に揃える規則。
// 読み書きは kana-canonical-cli.js (nr kana:canonical)。DB だけを書く (D-0091)。
//
//   kata    カタカナを普通に読んでいるよみ    パソ → ぱそ   (カタカナは半指定の記法なので)
//   youon4  拗音 4 字の自動省略               じょんき → じょ(ん)き
//   restore / middle                          kana-skip-migrate.js の規則 (途中の読まないかなを ( ) で書く)
//                                             語尾の書き足し (tail など) は最短よみの規則と食い違うので当てない
//   half    番号に合わない 2 桁かなを半指定に みつる → みツる (候補が 1 つに決まるときだけ)
//
// kata / youon4 / restore / middle / tail は読む数字を変えない置き換え。
// half だけは番号に合っていなかったよみを合わせる置き換え (読み方を書き足す)。
// かなを書き換えたら、代表 (rep.picks) と評価 (ratings) の k も付け替える。
// どちらも {k, w} の完全一致で語に紐付いているので、付け替えないと外れる。

import { SLOT_KEYS } from './sheet-layout.js'
import { KANA_CELL_PATTERN, hasNotation } from './kana-notation.js'
import { skipRewriteFor } from './kana-skip-migrate.js'
import { encode } from './encoder.js'

const KANA_CELL = new RegExp(KANA_CELL_PATTERN)
const SMALL = 'ぁぃぅぇぉゃゅょー'

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

const toKata = (s) =>
  s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
const toHira = (s) =>
  s.replace(/[ァ-ヶ]/g, (ch) =>
    ch === 'ヵ' || ch === 'ヶ' || ch === 'ヴ'
      ? ch
      : String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )

const digitsOf = (kana) => {
  try {
    return encode(kana).digits
  } catch {
    return null
  }
}

/**
 * 番号に合うか。頭 3 桁が番号なら余り (のるん / 末尾で境界を跨ぐ たま=550|0) も合うとみなす。
 * 先頭 0 の省略 (れい=01) も合う。境界を跨ぐ 2 桁かなを半指定で書くかは未決 (docs/kana-notation.md)
 */
const fitsNum = (digits, num) =>
  digits !== null &&
  (digits.startsWith(num) ||
    (digits.length < num.length &&
      num.endsWith(digits) &&
      /^0+$/.test(num.slice(0, num.length - digits.length))))

/** パソ → ぱそ。ひらがなにしても読む数字が同じなら置き換える */
export function kataPlainFor(kana) {
  if (!/[ァ-ヶ]/.test(kana) || /[()]/.test(kana)) return null
  // 半指定として読めるなら記法として書かれているので触らない
  if (digitsOf(kana) !== null) return null
  const hira = toHira(kana)
  return KANA_CELL.test(hira) && digitsOf(hira) !== null ? hira : null
}

/** じょんき → じょ(ん)き。拗音 4 字の省略を encoder が暗黙に当てているよみ */
export function youon4SkipFor(kana) {
  if (hasNotation(kana)) return null
  let result
  try {
    result = encode(kana)
  } catch {
    return null
  }
  if (!result.youon4) return null
  const chars = [...kana]
  const next = `${chars[0]}${chars[1]}(${chars[2]})${chars[3]}`
  return digitsOf(next) === result.digits ? next : null
}

/** 地のかなの位置 (半指定にできる字の頭)。( ) の中と小書きは除く */
function halfStarts(kana) {
  const chars = [...kana]
  const starts = []
  let depth = 0
  chars.forEach((ch, i) => {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && /[ぁ-ゖ]/.test(ch) && !SMALL.includes(ch))
      starts.push(i)
  })
  return starts
}

/** i 文字目 (と続く小書き) をカタカナにしたよみ。作れなければ null */
function withHalfAt(chars, i) {
  const len = SMALL.includes(chars[i + 1] ?? '') ? 2 : 1
  return [
    ...chars.slice(0, i),
    toKata(chars.slice(i, i + len).join('')),
    ...chars.slice(i + len),
  ]
}

/**
 * 番号に合わないよみを、2 桁かなを半指定 (カタカナ) にして合わせる。
 * 1 箇所で合う候補がちょうど 1 つのときだけ返す (複数あれば人が選ぶ)
 */
export function halfFor(kana, num) {
  if (!/^\d{3}$/.test(num) || /[ァ-ヶ]/.test(kana)) return null
  if (fitsNum(digitsOf(kana), num)) return null
  const chars = [...kana]
  const found = new Set()
  for (const i of halfStarts(kana)) {
    const next = withHalfAt(chars, i).join('')
    if (KANA_CELL.test(next) && fitsNum(digitsOf(next), num)) found.add(next)
  }
  return found.size === 1 ? [...found][0] : null
}

/**
 * 1 枠のよみの置き換え。読み方を変えない置き換えを先に当て、番号に合わないものは中間の省略か半指定で合わせる
 * @returns {{ kinds: string[], to: string } | null}
 */
export function canonicalRewriteFor(word, kana, num) {
  const from = text(kana)
  if (!from) return null
  let to = from
  const kinds = []
  const apply = (kind, next) => {
    if (!next || next === to) return
    to = next
    kinds.push(kind)
  }
  apply('kata', kataPlainFor(to))
  apply('youon4', youon4SkipFor(to))
  // restore / tail は読む数字を変えずに書き方だけ直す規則なので、番号に合っているよみにだけ当てる。
  // 合っていないよみに tail を当てると «みつる → みつ(る)» のように別の番号の形に揃えてしまう
  const fits = fitsNum(digitsOf(to), num)
  const skip = skipRewriteFor(word, to, num)
  // 語尾の書き足し (tail / 語尾まで戻す restore) は当てない。よみは 3 桁に届く最短で止める
  // 規則 (キスマーク=きす) と食い違うため未決 (docs/kana-notation.md)
  const isTrailing = (next) => next.endsWith(')')
  if (
    skip &&
    skip.kind !== 'tail' &&
    !isTrailing(skip.to) &&
    (fits || skip.kind === 'middle')
  )
    apply(skip.kind, skip.to)
  else if (!fits) apply('half', halfFor(to, num))
  return kinds.length ? { kinds, to } : null
}

const sameEntry = (entry, k, w) => text(entry?.k) === k && text(entry?.w) === w

/** {k, w} の一覧の k を付け替える。付け替えで重なったものは先のものを残す */
export function rekeyEntries(list, moves) {
  const seen = new Set()
  const out = []
  for (const entry of list ?? []) {
    const move = moves.find((m) => sameEntry(entry, m.from, m.word))
    const next = move ? { ...entry, k: move.to } : entry
    const key = `${text(next.k)}\u0001${text(next.w)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

/**
 * DB の番号文書 1 件の置き換え。変えるものが無ければ null
 * @returns {{ next: object, changes: {slot, kinds, word, from, to}[] } | null}
 */
export function canonicalizeDoc(doc) {
  const num = text(doc?.num)
  const changes = []
  const slots = { ...doc?.slots }
  for (const slot of SLOT_KEYS) {
    const value = slots[slot]
    const rewrite = canonicalRewriteFor(value?.word, value?.kana, num)
    if (!rewrite) continue
    changes.push({
      slot,
      kinds: rewrite.kinds,
      word: text(value.word),
      from: text(value.kana),
      to: rewrite.to,
    })
    slots[slot] = { ...value, kana: rewrite.to }
  }
  if (!changes.length) return null
  const next = { ...doc, slots }
  if (doc.rep) {
    next.rep = { ...doc.rep, picks: rekeyEntries(doc.rep.picks, changes) }
  }
  if (doc.ratings !== undefined) {
    next.ratings = rekeyEntries(doc.ratings, changes)
  }
  return { next, changes }
}
