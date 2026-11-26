// 記号の結び付きを «一覧の項目» (同じ role + order の語のまとまり) に戻す。
// 出典 2 つの項目は語 2 つ = 結び付き 2 つなので、表示・シート・代表の照合はこの単位で見る。

import { formatItem } from './notation.js'

/** @returns [{ role, order, links, notation, kana }] (結び付きの並び順) */
export function itemsOfSymbol(symbol, wordsById) {
  const groups = symbol.links.reduce((acc, link) => {
    const key = `${link.role}:${link.order}`
    return acc.set(key, [...(acc.get(key) ?? []), link])
  }, new Map())
  return [...groups.values()].map((links) => {
    const [first] = links
    const parts = links.map((link, i) => {
      const word = wordsById[link.wordId]
      if (!word) throw new Error(`${symbol.id}: 語が無い ${link.wordId}`)
      return {
        text: word.text,
        source: word.source,
        ...(i === 0
          ? {
              attrs: link.attrs,
              sourceAt: link.sourceAt,
              labels: link.labels,
              ...(link.raw !== undefined ? { raw: link.raw } : {}),
            }
          : {}),
      }
    })
    return {
      role: first.role,
      order: first.order,
      links,
      notation: formatItem(parts, first.role),
      kana: first.kana,
    }
  })
}
