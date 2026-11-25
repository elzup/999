// v2_ (語 1 つずつの行) から、旧 numbers 文書と同じ形の文書を組み立てる。
// アプリ (/api/app/data の withLiveNumbers) は旧の形 (hito/mono/gainen の文字列と slots) を読むので、
// 読み込み先を v2_ に替えても、ここで旧の形に戻せば画面側は変えずに済む。

const TAG_RE = /#([^\s#,]+)/g
const ATTRIBUTE_TAGS = new Set(['g', 'i'])
const SIDES = ['hito', 'mono', 'gainen']

const sourceTags = (text) =>
  [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1]))].filter(
    (t) => !ATTRIBUTE_TAGS.has(t)
  )

/**
 * 出典タグごとに分けた語 (migrate-v2 の splitVariants) を、元の 1 項目に戻す。
 * 同じ side・base・slot で並んでいて、出典タグが 1 つずつ違う語が、元は 1 項目だった。
 * 戻すときは、先頭の語の最後の出典タグの直後に、残りの語の出典タグを順に差し込む
 */
export function mergeVariants(words) {
  const groups = words.reduce((acc, w) => {
    const last = acc.at(-1)
    const tags = sourceTags(w.text)
    // item (元の一覧の何番目か) があればそれで決める。無い古い行だけ、本体・枠・タグから推す
    const hasItem = Number.isInteger(w.item) && Number.isInteger(last?.item)
    const canJoin = hasItem
      ? last.side === w.side && last.item === w.item
      : last &&
        last.side === w.side &&
        last.base === w.base &&
        last.slot === w.slot &&
        tags.length === 1 &&
        last.tags.length >= 1 &&
        !last.tags.includes(tags[0])
    if (!canJoin) return [...acc, { ...w, tags, texts: [w.text] }]
    return [
      ...acc.slice(0, -1),
      {
        ...last,
        tags: [...last.tags, tags[0]],
        texts: [...last.texts, w.text],
      },
    ]
  }, [])
  return groups.map((g) => {
    if (g.texts.length === 1) return { ...g, raw: g.texts[0] }
    const first = g.texts[0]
    const lastTag = `#${g.tags[0]}`
    const at = first.lastIndexOf(lastTag) + lastTag.length
    const extra = g.tags
      .slice(1)
      .map((t) => `#${t}`)
      .join('')
    return { ...g, raw: first.slice(0, at) + extra + first.slice(at) }
  })
}

/**
 * v2_ の 1 番号ぶんから、旧 numbers 文書の形を作る。
 * - words: その番号の v2_words (num 一致)
 * - head: v2_numbers の文書
 * - ratings: その番号の v2_ratings。n ラベル由来 (id が _n で始まる) は旧に無いので外す
 */
export function assembleNumberDoc(num, { words, head, ratings }) {
  const sorted = [...words].sort((a, b) => a.seq - b.seq)
  const merged = mergeVariants(sorted)
  const sides = Object.fromEntries(
    SIDES.map((side) => [side, joinSide(merged.filter((w) => w.side === side))])
  )
  const slots = merged
    .filter((w) => w.slot)
    .reduce(
      (acc, w) => ({ ...acc, [w.slot]: { word: w.raw, kana: w.kana ?? '' } }),
      {}
    )
  return {
    num,
    ...sides,
    slots,
    rep: {
      picks: (head?.repPicks ?? []).map((p) => ({ k: p.k, w: p.text })),
      confirmed: Boolean(head?.confirmed),
    },
    ratings: ratings
      .filter((r) => !String(r._id ?? '').includes('_n'))
      .sort((a, b) => idSeq(a._id) - idSeq(b._id))
      .map((r) => ({ k: r.k, w: r.w, v: r.v })),
    source: head?.source ?? '',
    updatedAt: head?.updatedAt ?? null,
  }
}

/**
 * 1 つの side の語を、旧の «,» 区切りの文字列に戻す。
 * item (元の位置) があれば、その位置に置いて間を空の項目で埋める (空きは枠を空ける意味を持つ)
 */
function joinSide(words) {
  if (!words.every((w) => Number.isInteger(w.item))) {
    return words.map((w) => w.raw).join(',')
  }
  const length = words.reduce((max, w) => Math.max(max, w.item + 1), 0)
  const cells = Array.from({ length }, () => '')
  const placed = words.reduce(
    (acc, w) => acc.map((cell, i) => (i === w.item ? w.raw : cell)),
    cells
  )
  return placed.join(',')
}

const idSeq = (id) =>
  Number(
    String(id ?? '')
      .split('_')
      .pop()
  ) || 0
