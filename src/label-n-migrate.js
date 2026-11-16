// ラベル -n (馴染みがない) を主観評価 -1 へ移す (nr label:n) の置き換え規則。
// 読み書きは label-n-migrate-cli.js。
//
// -n は «人から見てこの語呂は無し寄り» という主観で、評価 (ratings) の -1 と同じものを
// 指している。語の文字列に埋め込んだままだと、語 (タイトル) そのものが変わったとして
// 代表・評価・画像の対応 ({k, w}) を割ってしまうので、評価側に寄せて語からは外す。
//
// 評価は «読み + 語» の組で持つので、読み (かな) の入ったスロットの語だけが移せる。
// 一覧の 4 番目以降や、かなの無い枠の語は移し先が無いので -n を残す (情報を消さない)。

import { SIDE_SLOTS } from './sheet-layout.js'

/** 移す評価の値 */
export const LABEL_N_RATING = -1

// scorer.js#getLabelPenalty と同じく、«#» «,» の直前にある -n も拾う (茶湯 -n#g)
const LABEL_N = /(^|\s)-n(?=[\s#,]|$)/g

const text = (value) =>
  value === null || value === undefined ? '' : String(value)

export function hasLabelN(word) {
  return new RegExp(LABEL_N.source).test(text(word))
}

/** 語 1 つから -n を外す。前後の空白は 1 つにまとめる */
export function stripLabelN(word) {
  return text(word)
    .replace(LABEL_N, '$1')
    .replace(/\s+([#,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * 一覧セル («信長,空海#a -n,…») のうち、移せる位置の項目からだけ -n を外す。
 * canMove(i) が真の位置 (0 始まり) が対象。項目の前後の空白は触らない
 */
export function stripLabelNInList(list, canMove) {
  const value = text(list)
  if (!hasLabelN(value)) return value
  return value
    .split(',')
    .map((item, i) => {
      if (!canMove(i) || !hasLabelN(item)) return item
      const lead = item.match(/^\s*/)[0]
      return lead + stripLabelN(item)
    })
    .join(',')
}

/** 一覧のうち -n が残る項目 (移せなかった語) */
export function remainingLabelN(list, canMove) {
  return text(list)
    .split(',')
    .map((item) => item.trim())
    .filter((item, i) => !canMove(i) && hasLabelN(item))
}

const sameEntry = (entry, k, w) =>
  text(entry?.k) === text(k) && text(entry?.w) === text(w)

const valueKey = (entry) => `${text(entry?.k)}\u0001${text(entry?.w)}`

/** {k, w} の一覧の w を置き換え、置き換えで重なったものは先のものを残す */
function renameEntries(list, moves) {
  const seen = new Set()
  const out = []
  for (const entry of list) {
    const move = moves.find((m) => sameEntry(entry, m.k, m.from))
    const next = move ? { ...entry, w: move.to } : entry
    const key = valueKey(next)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

/**
 * numbers/{num} 1 件の移行結果。変わらなければ null。
 *
 * - かなの入ったスロットの語から -n を外す (確定時の語 confirmedFor も)
 * - 一覧 (hito / mono) の同じ位置の項目からも外す
 * - 代表 (rep.picks) と評価 (ratings) の語を付け替える
 * - その語に評価がまだ無ければ -1 を付ける。既に評価があればそちらを優先する
 *   (-n より後に人が付けた評価のほうが新しい判断なので上書きしない)
 *
 * @returns {{ next, moves: {slot, k, from, to, rating, kept}[], remaining: string[] } | null}
 */
export function migrateLabelNInDoc(doc) {
  const moves = []
  const slots = Object.fromEntries(
    Object.entries(doc.slots ?? {}).map(([slot, value]) => {
      const kana = text(value?.kana).trim()
      if (!kana || !hasLabelN(value?.word)) return [slot, value]
      const to = stripLabelN(value.word)
      moves.push({ slot, k: kana, from: value.word, to })
      const next = { ...value, word: to }
      if (value.confirmedFor !== undefined) {
        next.confirmedFor = stripLabelN(value.confirmedFor)
      }
      return [slot, next]
    })
  )

  // 一覧は «かなが入っているスロットに当たる位置» だけ外す。
  // シート側 (planSheetRow) と同じ規則にしておかないと、片方だけ -n が残る
  const movable = (side) => (i) => {
    const slot = SIDE_SLOTS[side][i]
    return Boolean(slot && text(doc.slots?.[slot]?.kana).trim())
  }

  const next = { ...doc, slots }
  for (const side of ['hito', 'mono']) {
    if (doc[side] !== undefined) {
      next[side] = stripLabelNInList(doc[side], movable(side))
    }
  }

  if (doc.rep) {
    next.rep = { ...doc.rep, picks: renameEntries(doc.rep.picks ?? [], moves) }
  }

  const ratings = renameEntries(doc.ratings ?? [], moves)
  for (const move of moves) {
    const found = ratings.find((entry) => sameEntry(entry, move.k, move.to))
    if (found) {
      move.rating = found.v
      move.kept = true
      continue
    }
    ratings.push({ k: move.k, w: move.to, v: LABEL_N_RATING })
    move.rating = LABEL_N_RATING
    move.kept = false
  }
  if (doc.ratings !== undefined || moves.length > 0) next.ratings = ratings

  const remaining = [
    ...remainingLabelN(next.hito, movable('hito')),
    ...remainingLabelN(next.mono, movable('mono')),
    ...Object.entries(next.slots)
      .filter(([, value]) => hasLabelN(value?.word))
      .map(([slot, value]) => `${slot}:${value.word}`),
  ]

  if (JSON.stringify(next) === JSON.stringify(doc)) {
    return remaining.length ? { next: null, moves, remaining } : null
  }
  return { next, moves, remaining }
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
 * シート 1 タブ分の置き換え。values は 1 行目が見出しの 2 次元配列、
 * columns は sheet-io#columnsOf の {field: 列番号}。
 * 人 / 物 セルのうち、かな列が埋まっている位置の項目だけ -n を外す。
 * 語の列 (wh1 など) は一覧から式で取り出しているので書かない
 * @returns {{ changes: {cell, num, before, after}[], remaining: {num, word}[] }}
 */
export function migrateLabelNInSheet(values, columns) {
  const changes = []
  const remaining = []
  values.slice(1).forEach((row, i) => {
    const num = text(row[columns.num]).trim()
    if (!/^\d{3}$/.test(num)) return
    for (const side of ['hito', 'mono']) {
      const col = columns[side]
      const movable = (index) => {
        const slot = SIDE_SLOTS[side][index]
        return Boolean(slot && text(row[columns[`${slot}k`]]).trim())
      }
      const before = text(row[col])
      const after = stripLabelNInList(before, movable)
      if (after !== before) {
        changes.push({ cell: `${columnName(col)}${i + 2}`, num, before, after })
      }
      for (const word of remainingLabelN(after, movable)) {
        remaining.push({ num, word })
      }
    }
  })
  return { changes, remaining }
}
