// 整合検査。spec: .metarc/db-design-v4.md §1 (C1〜C8)
// 書き込み口は保存の前後にこれを呼び、errors があれば保存しない。notices は人が見る一覧。

import { WORD_ID_RE } from './ids.js'
import { isRoleAllowed } from './roles.js'

const SYMBOL_ID_RE =
  /^(num:\d{3}|date:\d{3,4}|card:[SHCD](A|[2-9]|10|J|Q|K)|hex:[0-9A-F]{2})$/

function symbolErrors(symbol, wordsById) {
  const errors = []
  const add = (rule, detail) => errors.push({ rule, symbol: symbol.id, detail })
  if (!SYMBOL_ID_RE.test(symbol.id))
    add('id', `記号の ID の形が違う: ${symbol.id}`)
  if (!symbol.id.startsWith(`${symbol.kind}:`))
    add('id', `kind と ID が合わない: ${symbol.kind}`)
  const seen = new Set()
  for (const link of symbol.links) {
    if (!wordsById[link.wordId]) add('C1', `指す語が無い: ${link.wordId}`)
    if (!isRoleAllowed(symbol.kind, link.role))
      add('C4', `${symbol.kind} に ${link.role} は使えない`)
    const key = `${link.role}:${link.order}:${link.wordId}`
    if (seen.has(key)) add('C5', `同じ枠に同じ語が 2 回: ${key}`)
    seen.add(key)
  }
  // 同じ role + order に語が 2 つ以上あるのは «出典 2 つの項目» だけ。出典が重なれば作りの誤り
  const items = symbol.links.reduce((acc, l) => {
    const k = `${l.role}:${l.order}`
    return acc.set(k, [...(acc.get(k) ?? []), l])
  }, new Map())
  for (const [at, group] of items) {
    const sources = group.map((l) => wordsById[l.wordId]?.source)
    if (group.length > 1 && new Set(sources).size !== group.length) {
      add('C5', `同じ枠の語が出典で分かれていない: ${at}`)
    }
  }
  const linked = new Set(symbol.links.map((l) => l.wordId))
  for (const pick of symbol.rep?.picks ?? []) {
    if (pick.wordId && !linked.has(pick.wordId))
      add('C6', `代表の語が結び付きに無い: ${pick.wordId}`)
  }
  const wordIds = [...linked].sort().join(',')
  if ((symbol.wordIds ?? []).toSorted().join(',') !== wordIds)
    add('wordIds', 'wordIds が links と合わない')
  return errors
}

/** @returns {{ errors: [{rule, symbol?, word?, detail}], notices: [{rule, detail, words}] }} */
export function checkIntegrity({ symbols, words }) {
  const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
  const used = new Set(symbols.flatMap((s) => s.links.map((l) => l.wordId)))
  const errors = [
    ...symbols.flatMap((s) => symbolErrors(s, wordsById)),
    ...words.flatMap((w) => [
      ...(WORD_ID_RE.test(w.id)
        ? []
        : [{ rule: 'C8', word: w.id, detail: '語の ID の形が違う' }]),
      ...(used.has(w.id)
        ? []
        : [
            {
              rule: 'C2',
              word: w.id,
              detail: `どこからも指されない: ${w.text}`,
            },
          ]),
    ]),
  ]
  // C9: 1 語は同じ kind の記号に 1 回まで (番号とカードの両方は可、番号 2 つは登録のミス: D-0165)
  const kindsOf = symbols.reduce((acc, s) => {
    for (const id of new Set(s.links.map((l) => l.wordId))) {
      acc.set(id, [...(acc.get(id) ?? []), s])
    }
    return acc
  }, new Map())
  const c9 = [...kindsOf].flatMap(([id, list]) =>
    Object.entries(Object.groupBy(list, (s) => s.kind))
      .filter(([, same]) => same.length > 1)
      .map(([kind, same]) => ({
        rule: 'C9',
        word: id,
        detail: `同じ ${kind} の記号 ${same.length} つから指される: ${
          wordsById[id]?.text
        } (${same.map((s) => s.id).join(' ')})`,
      }))
  )
  const byKey = words.reduce((acc, w) => {
    const key = `${w.text}|${w.source}`
    return acc.set(key, [...(acc.get(key) ?? []), w.id])
  }, new Map())
  const notices = [...byKey]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({
      rule: 'C3',
      detail: `同じ綴りの語が ${ids.length} つ: ${key}`,
      words: ids,
    }))
  return { errors: [...errors, ...c9], notices }
}
