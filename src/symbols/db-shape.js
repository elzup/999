// DB (コレクション symbols / words) に置く形と、端末の symbol (model.js) との変換。
// spec: .metarc/db-design-targets.md §3。
//
// 端末の symbol との違い:
// - 結び付きの配列は `words` (model.js では links)。語は文書 ID (発番) で指し、鍵 (種別|本体|出典) は語の key 欄に持つ
// - 代表は語の ID で指す: rep.picks = [{ wordId }]。どの語か 1 つに決まらないもの (人と物に同じ表記) は
//   今の «かな + 表記» のまま残す: { k, w }
// - 評価はその記号での語の値として結び付きに持つ: words[].rating。語に結び付かない評価は looseRatings
//   (語を消しても評価は残す仕様: src/firestore/console-writes.js)
//
// 語の ID で指すのは、元の «かな + 表記» をそこから正確に作り直せるときだけ。作り直せないものは
// 文字列のまま残す (取りこぼして値が変わるより、文字列が残る方がまし)。
import { formatNotation, resolveRefs } from './model.js'

const REF_KEYS = new Set(['k', 'w', 'v'])

const notationOf = (link, word) =>
  formatNotation(
    { text: word.text, tags: link.tags, labels: link.labels },
    word.category
  )

/** 語の ID で指したとき、元の «かな + 表記» に戻せる結び付き。戻せなければ null */
function exactLink(symbol, wordsById, ref, wordIds) {
  if (wordIds.length !== 1) return null
  // k / w / v 以外の欄 (古い印など) を持つものは作り直せないので文字列のまま
  if (Object.keys(ref).some((key) => !REF_KEYS.has(key))) return null
  const link = symbol.links.find((l) => l.wordId === wordIds[0])
  const word = wordsById[wordIds[0]]
  if (!link || !word) return null
  const sameKana = String(link.kana ?? '') === String(ref.k ?? '')
  return sameKana && notationOf(link, word) === ref.w ? link : null
}

/**
 * 端末の symbol → DB の文書。docIdOf は語の鍵 → 文書 ID
 * 戻り値の stats は、語の ID で指せた数と文字列のまま残した数
 */
export function toDbSymbol(symbol, wordsById, docIdOf) {
  const { id: _id, links, rep, ratings, ...rest } = symbol
  const refs = resolveRefs(symbol, wordsById)
  const refOf = (kind, index) =>
    refs.find((r) => r.kind === kind && r.index === index)?.wordIds ?? []

  const picks = (rep?.picks ?? []).map((pick, index) => {
    const link = exactLink(symbol, wordsById, pick, refOf('rep', index))
    return link ? { wordId: docIdOf(link.wordId) } : { ...pick }
  })

  const linkRating = new Map()
  const looseRatings = []
  ;(ratings ?? []).forEach((rating, index) => {
    const link = exactLink(symbol, wordsById, rating, refOf('rating', index))
    if (link && !linkRating.has(link)) linkRating.set(link, rating.v)
    else looseRatings.push(rating)
  })

  const words = links.map((link) => ({
    ...link,
    wordId: docIdOf(link.wordId),
    ...(linkRating.has(link) ? { rating: linkRating.get(link) } : {}),
  }))
  return {
    doc: {
      ...rest,
      words,
      wordIds: [...new Set(words.map((w) => w.wordId))],
      ...(rep ? { rep: { ...rep, picks } } : {}),
      ...(ratings ? { looseRatings } : {}),
    },
    stats: {
      picks: picks.length,
      loosePicks: picks.filter((p) => !p.wordId).length,
      ratings: (ratings ?? []).length,
      looseRatings: looseRatings.length,
    },
  }
}

/** DB の文書 → 端末の symbol。keyOf は文書 ID → 語の鍵、wordsById は鍵 → 語 */
export function fromDbSymbol(id, doc, keyOf, wordsById) {
  const { words, wordIds: _ids, looseRatings, rep, ...rest } = doc
  // 数値以外の欄 (カードの score など) は持っているものをそのまま使う
  const hasNumberRatings = Array.isArray(looseRatings)
  const links = (words ?? []).map((l) => {
    const { rating, ...link } = l
    return {
      ...link,
      wordId: keyOf(l.wordId),
      ...(hasNumberRatings ? {} : rating !== undefined ? { rating } : {}),
    }
  })
  const back = (wordId) => {
    const index = (words ?? []).findIndex((l) => l.wordId === wordId)
    const link = links[index]
    return { link, word: wordsById[link?.wordId] }
  }
  const picks = (rep?.picks ?? []).map((pick) => {
    if (!pick.wordId) return pick
    const { link, word } = back(pick.wordId)
    return { k: link.kana, w: notationOf(link, word) }
  })
  const ratings = hasNumberRatings
    ? [
        ...(words ?? []).flatMap((l, index) =>
          l.rating === undefined
            ? []
            : [
                {
                  k: links[index].kana,
                  w: notationOf(links[index], wordsById[links[index].wordId]),
                  v: l.rating,
                },
              ]
        ),
        ...looseRatings,
      ]
    : undefined
  return {
    ...rest,
    id,
    links,
    ...(rep ? { rep: { ...rep, picks } } : {}),
    ...(ratings ? { ratings } : {}),
  }
}
