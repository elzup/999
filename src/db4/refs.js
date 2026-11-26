// 代表・評価の «かな + 表記» ({k, w}) を語の ID に置き換える。spec: db-design-v4.md §3 / D-0156
//
// 置き換えるのは «元の {k, w} をそこから正確に作り直せる» ときだけ:
// - 表記 w が項目の綴りと一致し、かな k が項目のかなと完全に一致する ('' と欄なしは別)
// - その項目の語が 1 つ (出典 2 つの項目は語が決まらない)
// - その語がこの記号に 1 回だけ出る (ID から項目を 1 つに戻せる)
// 作り直せないものは文字列のまま残す (代表は picks に {k, w}、評価は looseRatings)。

import { itemsOfSymbol, variantOf } from './items.js'

const REF_KEYS = new Set(['k', 'w', 'v'])

function matcher(symbol, wordsById) {
  const items = itemsOfSymbol(symbol, wordsById)
  const countOf = (wordId) =>
    symbol.links.filter((l) => l.wordId === wordId).length
  return (ref) => {
    if (Object.keys(ref).some((key) => !REF_KEYS.has(key))) return null
    const hits = items.filter(
      (item) => item.notation === ref.w && item.kana === ref.k
    )
    if (hits.length === 1 && hits[0].links.length === 1) {
      const { wordId } = hits[0].links[0]
      return countOf(wordId) === 1 ? wordId : null
    }
    // 出典 2 つの項目の 1 語分 (217 ニーナ#ｺｰﾄﾞｷﾞｱｽ: P7-4)。アプリは項目を出典ごとの語に分けて代表を選ぶ
    const parts = items.flatMap((item) =>
      item.kana === ref.k && item.links.length > 1
        ? item.links.filter((l) => variantOf(item, l, wordsById) === ref.w)
        : []
    )
    return parts.length === 1 && countOf(parts[0].wordId) === 1
      ? parts[0].wordId
      : null
  }
}

/** @returns {{ symbol }} rep / links[].rating / looseRatings を埋めた記号 */
export function resolveRefs(symbol, legacy = {}, wordList = []) {
  const wordsById = Object.fromEntries(wordList.map((w) => [w.id, w]))
  const match = matcher(symbol, wordsById)
  const ratings = legacy.ratings ?? []
  const rated = ratings.reduce(
    (acc, ref) => {
      const wordId = match(ref)
      const isFree = wordId && !(wordId in acc.byWord)
      return isFree
        ? { ...acc, byWord: { ...acc.byWord, [wordId]: ref.v } }
        : { ...acc, loose: [...acc.loose, ref] }
    },
    { byWord: {}, loose: [] }
  )
  const links = symbol.links.map((link) =>
    link.wordId in rated.byWord && link.rating === undefined
      ? { ...link, rating: rated.byWord[link.wordId] }
      : link
  )
  const rep = legacy.rep
    ? {
        ...legacy.rep,
        // 同じ語の 2 回目は ID にしない (C6: 代表に同じ語は 1 回)。文字列のまま残して人が直す
        picks: (legacy.rep.picks ?? []).reduce((acc, pick) => {
          const wordId = match(pick)
          const isFree =
            wordId && !('v' in pick) && !acc.some((p) => p.wordId === wordId)
          return [...acc, isFree ? { wordId } : pick]
        }, []),
      }
    : undefined
  return {
    symbol: {
      ...symbol,
      links,
      ...(rep ? { rep } : {}),
      ...(legacy.ratings !== undefined ? { looseRatings: rated.loose } : {}),
    },
  }
}
