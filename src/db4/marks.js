// 属性とラベルの enum 表 (D-0177)。DB にはコードだけを書き、意味はここ 1 か所で引く (アプリも読む)。
//
// 置き場所:
//   語の性質 (どの記号でも同じ) … 属性 g / i、ラベル j / u / f → 語の文書 (word.attrs / word.labels)
//   その記号での当てはまり       … ラベル x / r                 → 結び付き (link.labels)
// 持たないもの:
//   -n 馴染みがない → 評価 -1 (link.rating) に移す
//   -s 中抜き       → 廃止 (D-0143)
//   -m 同数異音 / -p 0xx / -a 余り → よみから計算で出せる (rankey) ので持たない

export const ATTRS = Object.freeze({
  g: { label: '概念' },
  i: { label: '身内' },
})

export const WORD_LABELS = Object.freeze({
  j: { label: '熟語' },
  u: { label: '愛称・ユニーク' },
  f: { label: 'お気に入り' },
})

export const LINK_LABELS = Object.freeze({
  x: { label: '語呂強引' },
  r: { label: '連想' },
})

/** 旧データにだけあるラベル。読み込むときに移すか捨てる */
export const DROPPED_LABELS = Object.freeze({
  n: { label: '馴染みがない', to: 'rating -1' },
  s: { label: 'サンド・中抜き', to: '廃止' },
  m: { label: '同数異音混在', to: '計算' },
  p: { label: '0xx', to: '計算' },
  a: { label: '余りあり', to: '計算' },
})

const has = (table, code) => Object.prototype.hasOwnProperty.call(table, code)

/** 表示名。属性 → 語のラベル → 記号のラベル → 旧ラベルの順に引く。表に無ければコードのまま */
export const markLabel = (code) =>
  (
    ATTRS[code] ??
    WORD_LABELS[code] ??
    LINK_LABELS[code] ??
    DROPPED_LABELS[code]
  )?.label ?? code

/**
 * 表記から読んだ属性・ラベル → 置き場所ごとに分ける。
 * 知らない属性は属性のまま残す (出典タグと見分けられないものは notation.js が出典として扱う)
 * @returns {{ wordAttrs, wordLabels, linkLabels, rating }} rating は -n があれば -1 (無ければ undefined)
 */
export function splitMarks({ attrs = [], labels = [] }) {
  return {
    wordAttrs: attrs,
    wordLabels: labels.filter((l) => has(WORD_LABELS, l)),
    linkLabels: labels.filter((l) => has(LINK_LABELS, l)),
    rating: labels.includes('n') ? -1 : undefined,
  }
}

/** 語の性質をまとめる (同じ語が複数の記号にあるとき)。順は最初に出た順 */
export const unionMarks = (a = [], b = []) => [...new Set([...a, ...b])]

/**
 * 本番データの移行 (1 回だけ): 結び付きの属性・ラベルを置き場所ごとに分ける。
 * 語の性質は、その語を指す結び付き全部のものをまとめて語に載せる。-n は評価 -1 (評価が無いときだけ)
 * @returns {{ symbols, words }} 中で使う形 (語は source を持つ形のまま)
 */
export function migrateMarks({ symbols, words }) {
  const marksOf = symbols
    .flatMap((s) => s.links)
    .reduce((acc, link) => {
      const m = splitMarks({ attrs: link.attrs, labels: link.labels })
      const prev = acc.get(link.wordId) ?? { attrs: [], labels: [] }
      return new Map([
        ...acc,
        [
          link.wordId,
          {
            attrs: unionMarks(prev.attrs, m.wordAttrs),
            labels: unionMarks(prev.labels, m.wordLabels),
          },
        ],
      ])
    }, new Map())
  const nextSymbols = symbols.map((symbol) => ({
    ...symbol,
    links: symbol.links.map(({ attrs, labels, ...link }) => {
      const m = splitMarks({ attrs, labels })
      return {
        ...link,
        ...(m.linkLabels.length ? { labels: m.linkLabels } : {}),
        ...(m.rating !== undefined && link.rating === undefined
          ? { rating: m.rating }
          : {}),
      }
    }),
  }))
  const nextWords = words.map(({ attrs: oldAttrs, ...word }) => {
    const m = marksOf.get(word.id) ?? { attrs: [], labels: [] }
    const attrs = unionMarks(oldAttrs, m.attrs)
    return {
      ...word,
      labels: unionMarks(
        (word.labels ?? []).filter((l) => has(WORD_LABELS, l)),
        m.labels
      ),
      ...(attrs.length ? { attrs } : {}),
    }
  })
  return { symbols: nextSymbols, words: nextWords }
}
