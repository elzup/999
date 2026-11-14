// タグの一括リネーム (nr tag:rename) の置き換え規則。読み書きは tag-rename-cli.js。
//
// タグは語の文字列に埋め込まれていて DB にも正規化された一覧が無い。
// シートだけ置き換えると、DB の «タグ → 画像» (tagImages, D-0039) や代表 (rep.picks の w)
// との対応が外れるので、ここで同じ規則を両方にかける。

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** タグとして書ける名前か。区切り (空白・#・カンマ) を含むと別のタグに割れる */
export function isValidTagName(tag) {
  return typeof tag === 'string' && tag !== '' && !/[\s#,]/.test(tag)
}

/**
 * 文字列中の «#from» を «#to» に置き換える。セル (カンマ区切りの一覧) でも語 1 つでもよい。
 * 同じ語に既に #to があれば #from を消すだけにする (同じタグを 2 回持たせない)。
 */
export function renameTagInText(text, from, to) {
  const value = String(text ?? '')
  if (!value.includes(`#${from}`)) return value
  const token = new RegExp(`#${escapeRegExp(from)}(?=[\\s#,]|$)`, 'g')
  const hasTo = new RegExp(`#${escapeRegExp(to)}(?=[\\s#,]|$)`)
  return value
    .split(',')
    .map((item) =>
      hasTo.test(item)
        ? item.replace(token, '').replace(/\s{2,}/g, ' ')
        : item.replace(token, `#${to}`)
    )
    .join(',')
}

const valueKey = (entry) => `${entry?.k ?? ''}\u0001${entry?.w ?? ''}`

/** {k, w} の一覧の w を置き換え、置き換えで重なったものは先のものを残す */
function renameValues(list, from, to) {
  const seen = new Set()
  const out = []
  for (const entry of list) {
    const next = { ...entry, w: renameTagInText(entry.w, from, to) }
    const key = valueKey(next)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

function renameTagImages(tagImages, from, to) {
  if (!tagImages || !(from in tagImages)) return tagImages
  const { [from]: moved, ...rest } = tagImages
  // 新しい名前の画像が既にあればそちらを残す (後から付けた画像を上書きしない)
  return { ...rest, [to]: rest[to] ?? moved }
}

/**
 * numbers/{num} 1 件の置き換え結果。変わらなければ null。
 * 一覧 (hito / mono / gainen)、各スロットの語・確定時の語・タグ別の画像、
 * 代表と評価の語を置き換える。updatedAt / source は書き込み側が付ける。
 */
export function renameTagInDoc(doc, from, to) {
  const slots = Object.fromEntries(
    Object.entries(doc.slots ?? {}).map(([slot, value]) => {
      const next = { ...value, word: renameTagInText(value.word, from, to) }
      if (value.confirmedFor !== undefined) {
        next.confirmedFor = renameTagInText(value.confirmedFor, from, to)
      }
      if (value.tagImages !== undefined) {
        next.tagImages = renameTagImages(value.tagImages, from, to)
      }
      return [slot, next]
    })
  )
  const next = {
    ...doc,
    hito: renameTagInText(doc.hito, from, to),
    mono: renameTagInText(doc.mono, from, to),
    gainen: renameTagInText(doc.gainen, from, to),
    slots,
  }
  if (doc.rep) {
    next.rep = {
      ...doc.rep,
      picks: renameValues(doc.rep.picks ?? [], from, to),
    }
  }
  if (doc.ratings) next.ratings = renameValues(doc.ratings, from, to)
  return JSON.stringify(next) === JSON.stringify(doc) ? null : next
}

/** 0 始まりの列番号 → A1 表記の列名 (0 → A, 27 → AB) */
export function columnName(index) {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** シートのセルに書く人 / 物の列 (それ以外の語の列は式で取り出している) */
export const SHEET_WORD_HEADERS = ['人', '物']

/**
 * シート 1 タブ分の置き換え。values は 1 行目が見出しの 2 次元配列。
 * 返すのは変わるセルだけ ({ cell: 'B12', before, after })
 */
export function renameTagInSheet(values, from, to) {
  const header = values[0] ?? []
  const columns = SHEET_WORD_HEADERS.map((name) => header.indexOf(name)).filter(
    (index) => index >= 0
  )
  const changes = []
  values.slice(1).forEach((row, i) => {
    for (const col of columns) {
      const before = String(row[col] ?? '')
      const after = renameTagInText(before, from, to)
      if (after !== before) {
        changes.push({ cell: `${columnName(col)}${i + 2}`, before, after })
      }
    }
  })
  return changes
}
