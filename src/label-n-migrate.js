// ラベル -n (馴染みがない) を主観評価 -1 へ移す (nr label:n) の置き換え規則。
// 読み書きは label-n-migrate-cli.js。
//
// -n は «人から見てこの語呂は無し寄り» という主観で、評価 (ratings) の -1 と同じものを
// 指している。語の文字列に埋め込んだままだと、語 (タイトル) そのものが変わったとして
// 代表・評価・画像の対応 ({k, w}) を割ってしまうので、評価側に寄せて語からは外す。
//
// - -n はかなの有無・一覧の位置に関係なくすべて外す
// - 評価は «読み + 語» の組で持つので、-1 を付けられるのはかなの入ったスロットの語だけ。
//   それ以外 (かなの無い枠・一覧の 4 番目以降) は外すだけ
// - -n の語は «同じ番号に有力な別の語があれば語そのものを消してよい» もの。
//   有力な別の語 (評価 +1 以上 / 代表) がある語は削除検討候補として返す (自動では消さない)

import { SIDE_SLOTS } from './sheet-layout.js'

/** 移す評価の値 */
export const LABEL_N_RATING = -1
/** この評価以上の別の語があれば «有力な別の語» とみなす */
export const STRONG_RATING = 1

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

/** 一覧セル («信長,空海#a -n,…») の各項目から -n を外す。項目の前の空白は触らない */
export function stripLabelNInList(list) {
  const value = text(list)
  if (!hasLabelN(value)) return value
  return value
    .split(',')
    .map((item) =>
      hasLabelN(item) ? item.match(/^\s*/)[0] + stripLabelN(item) : item
    )
    .join(',')
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

/** 一覧のうち、スロット (かなのある 1〜3 番目) に当たらない位置の -n の語 */
function listOnlyLabelN(doc) {
  const out = []
  for (const [side, keys] of Object.entries(SIDE_SLOTS)) {
    text(doc[side])
      .split(',')
      .map((item) => item.trim())
      .forEach((item, i) => {
        if (!hasLabelN(item)) return
        const slot = keys[i]
        if (slot && text(doc.slots?.[slot]?.kana).trim()) return
        out.push({ side, word: stripLabelN(item) })
      })
  }
  return out
}

/**
 * 同じ番号の «有力な別の語»。評価 +1 以上か、代表に選ばれている語。
 * 自分自身 (同じ語) は除く
 */
function strongRivals(next, word) {
  const rivals = new Map()
  for (const entry of next.ratings ?? []) {
    if (entry.v >= STRONG_RATING && text(entry.w) !== word) {
      rivals.set(entry.w, `評価 +${entry.v}`)
    }
  }
  for (const pick of next.rep?.picks ?? []) {
    if (text(pick.w) !== word && !rivals.has(pick.w)) {
      rivals.set(pick.w, '代表')
    }
  }
  return [...rivals].map(([w, why]) => `${w} (${why})`)
}

/**
 * numbers/{num} 1 件の移行結果。変わらなければ null。
 *
 * - スロットの語・確定時の語・一覧 (hito / mono) の全項目から -n を外す
 * - 代表 (rep.picks) と評価 (ratings) の語を付け替える
 * - かなのあるスロットの語に評価がまだ無ければ -1 を付ける。既に評価があればそちらを
 *   優先する (-n より後に人が付けた評価のほうが新しい判断なので上書きしない)
 * - 評価が -1 (または付けられない) で、同じ番号に有力な別の語がある語は削除検討候補
 *
 * @returns {{ next, moves, unrated, candidates } | null}
 *   moves:      評価に移した語 {slot, k, from, to, rating, kept}
 *   unrated:    外しただけの語 (評価の移し先が無い) {side, word}
 *   candidates: 削除検討候補 {word, k, rating, rivals}
 */
export function migrateLabelNInDoc(doc) {
  const moves = []
  const slots = Object.fromEntries(
    Object.entries(doc.slots ?? {}).map(([slot, value]) => {
      const touched = hasLabelN(value?.word) || hasLabelN(value?.confirmedFor)
      if (!touched) return [slot, value]
      const to = stripLabelN(value.word)
      const kana = text(value?.kana).trim()
      if (kana && hasLabelN(value.word)) {
        moves.push({ slot, k: kana, from: value.word, to })
      }
      const next = { ...value, word: to }
      if (value.confirmedFor !== undefined) {
        next.confirmedFor = stripLabelN(value.confirmedFor)
      }
      return [slot, next]
    })
  )

  const unrated = listOnlyLabelN(doc)
  const next = { ...doc, slots }
  for (const side of ['hito', 'mono']) {
    if (doc[side] !== undefined) next[side] = stripLabelNInList(doc[side])
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

  const candidates = [
    ...moves
      .filter((m) => m.rating <= LABEL_N_RATING)
      .map((m) => ({ word: m.to, k: m.k, rating: m.rating })),
    ...unrated.map((u) => ({ word: u.word, k: '', rating: null })),
  ]
    .map((c) => ({ ...c, rivals: strongRivals(next, c.word) }))
    .filter((c) => c.rivals.length > 0)

  if (JSON.stringify(next) === JSON.stringify(doc)) return null
  return { next, moves, unrated, candidates }
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

/** シートのセルに書く人 / 物の列 (語の列は一覧から式で取り出している) */
const SHEET_WORD_HEADERS = ['人', '物']

/**
 * シート 1 タブ分の置き換え。values は 1 行目が見出しの 2 次元配列。
 * 人 / 物 セルの全項目から -n を外す。返すのは変わるセルだけ
 * @returns {{cell, before, after}[]}
 */
export function migrateLabelNInSheet(values) {
  const header = values[0] ?? []
  const columns = SHEET_WORD_HEADERS.map((name) => header.indexOf(name)).filter(
    (index) => index >= 0
  )
  const changes = []
  values.slice(1).forEach((row, i) => {
    for (const col of columns) {
      const before = text(row[col])
      const after = stripLabelNInList(before)
      if (after !== before) {
        changes.push({ cell: `${columnName(col)}${i + 2}`, before, after })
      }
    }
  })
  return changes
}
