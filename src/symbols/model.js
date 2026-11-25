// symbol (語を付ける相手: 番号・日付・カード) と word (語) の形と、今の API の形との変換。
// spec: .metarc/state-design.md (状態管理) / .metarc/db-design-targets.md (DB)。
//
// 端末のストアと、将来の DB の変換が同じ規則を使うため、node:fs を読まずにここへ置く。
// 今の形 (配信データの平たい 1 件・番号の文書・カード) を知っているのはこのファイルだけにする。
//
// 形 (保存はしない。端末のメモリの中の形):
//   word   = { id, category, text, tags }            tags は書かれた順 (出典・属性の両方)
//   link   = { wordId, order, kana?, labels }         order = 一覧の何番目か (空きも数える)
//   symbol = { id, kind, links, extras }              extras = まだ構造にしていない欄 (そのまま戻す)
// 語の役割 (人/物/行動) は word.category で決まる (番号の人・物、カードの P・O・A と 1 対 1)。

import { categoryScore, scoreFields } from '../entry-score.js'

const TAG_RE = /#([^\s#,]+)/g
// ラベルは «空白 + -英小文字 1 字»。後ろが空白・#・行末 (物の側は «語 -a#g» と書く)
const LABEL_RE = /(^|\s)-([a-z])(?=\s|#|$)/g
// 属性タグ (g = 概念, i = 身内) は出典ではない (app/lib/tagVariants.ts と同じ)
const ATTRIBUTE_TAGS = new Set(['g', 'i'])
const NUMBER_SIDES = ['hito', 'mono']
const SIDE_PREFIX = { hito: 'wh', mono: 'wm' }
const SLOTS_PER_SIDE = 3

// ── 語の表記 ──

/** 表記 1 つ (`黄泉#ｽﾀﾚ -n`) を本体・タグ・ラベルに分ける */
export function parseNotation(raw) {
  const tags = [...raw.matchAll(TAG_RE)].map((m) => m[1])
  const labels = [...raw.matchAll(LABEL_RE)].map((m) => m[2])
  const text = raw
    .replace(TAG_RE, '')
    .replace(LABEL_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, tags, labels }
}

/**
 * 本体・タグ・ラベルを表記に戻す。並びは今の配信データに合わせる:
 * 人の側は «語#タグ -ラベル»、物の側は «語 -ラベル#タグ»
 * (words.js の serializeTaggedItems が物の側だけ «ラベル込みの本体 + タグ» に組み直すため)
 */
export function formatNotation({ text, tags, labels }, category) {
  const tagPart = tags.map((t) => `#${t}`).join('')
  const labelPart = labels.map((l) => ` -${l}`).join('')
  return category === 'mono'
    ? `${text}${labelPart}${tagPart}`
    : `${text}${tagPart}${labelPart}`
}

export const sourceOf = (tags) => tags.find((t) => !ATTRIBUTE_TAGS.has(t)) ?? ''
const sourceTagsOf = (tags) => [
  ...new Set(tags.filter((t) => !ATTRIBUTE_TAGS.has(t))),
]

/** 出典タグが 2 つ以上なら、出典 1 つずつの表記に分ける (app/lib/tagVariants.ts と同じ規則) */
export function splitSources(parsed) {
  const sources = sourceTagsOf(parsed.tags)
  if (sources.length < 2) return [parsed]
  return sources.map((keep) => ({
    ...parsed,
    tags: parsed.tags.filter((t) => ATTRIBUTE_TAGS.has(t) || t === keep),
  }))
}

/** 分けた表記を 1 つに戻す。タグは元の表記に出てきた順 (先頭の語の並び + 残りの出典) */
function mergeSources(parts) {
  if (parts.length === 1) return parts[0]
  const [first, ...rest] = parts
  const firstSource = sourceOf(first.tags)
  const extra = rest.map((p) => sourceOf(p.tags))
  const tags = first.tags.flatMap((t) =>
    t === firstSource ? [t, ...extra] : [t]
  )
  return { ...first, tags }
}

// ── 語 ──

/** 同じ語かどうかの鍵 = 種別 + 本体 + 出典。端末の中だけで使う仮の id (保存しない) */
export const wordIdOf = (category, text, tags) =>
  `${category}|${text}|${sourceOf(tags)}`

const wordOf = (category, parsed) => ({
  id: wordIdOf(category, parsed.text, parsed.tags),
  category,
  text: parsed.text,
  tags: parsed.tags,
})

const byId = (words) => Object.fromEntries(words.map((w) => [w.id, w]))

/** 同じ id の語が違う中身で来たら、先に来た方を使い、食い違いとして返す */
export function mergeWords(lists) {
  return lists.flat().reduce(
    (acc, word) => {
      const seen = acc.words[word.id]
      if (!seen) return { ...acc, words: { ...acc.words, [word.id]: word } }
      const same = JSON.stringify(seen.tags) === JSON.stringify(word.tags)
      return same
        ? acc
        : { ...acc, conflicts: [...acc.conflicts, [seen, word]] }
    },
    { words: {}, conflicts: [] }
  )
}

// ── 番号 (と日付): 一覧の文字列 ⇔ 結び付き ──

const itemsOf = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())

/**
 * 人/物の一覧の文字列から、語と結び付きを作る。空の項目は位置として数える。
 * slotOf(category, order) は 1〜3 番目の枠の { kana, filled }。filled = 枠に語が入っているか
 * (一覧に語があっても枠が空のことがある: 439 の wm2)
 */
function linksFromLists(lists, slotOf) {
  const rows = NUMBER_SIDES.flatMap((category) =>
    itemsOf(lists[category]).flatMap((raw, order) =>
      raw ? [{ category, order, raw }] : []
    )
  )
  const parts = rows.flatMap(({ category, order, raw }) => {
    const parsed = parseNotation(raw)
    const slot = slotOf(category, order)
    return splitSources(parsed).map((part) => ({
      word: wordOf(category, part),
      link: {
        wordId: wordIdOf(category, part.text, part.tags),
        order,
        labels: part.labels,
        ...(slot
          ? { kana: slot.kana, ...(slot.filled ? {} : { slotted: false }) }
          : {}),
      },
    }))
  })
  // 末尾の空の項目 (`語,`) も表記のうちなので、項目の数を覚えておく
  const listLengths = Object.fromEntries(
    NUMBER_SIDES.map((category) => [category, itemsOf(lists[category]).length])
  )
  return {
    words: parts.map((p) => p.word),
    links: parts.map((p) => p.link),
    listLengths,
  }
}

/** 結び付きから人/物の一覧の文字列に戻す */
function listsFromLinks(links, words, listLengths = {}) {
  return Object.fromEntries(
    NUMBER_SIDES.map((category) => {
      const own = links.filter((l) => words[l.wordId]?.category === category)
      const length = own.reduce(
        (max, l) => Math.max(max, l.order + 1),
        own.length ? listLengths[category] ?? 0 : 0
      )
      const cells = Array.from({ length }, (_, order) => {
        const parts = own
          .filter((l) => l.order === order)
          .map((l) => ({ ...words[l.wordId], labels: l.labels }))
        return parts.length ? formatNotation(mergeSources(parts), category) : ''
      })
      return [category, cells.join(',')]
    })
  )
}

/** 一覧の 1〜3 番目 (枠) の表記とかな。分けた語は 1 項目に戻す */
function slotFromLinks(links, words, category, order) {
  const parts = links.filter(
    (l) => l.order === order && words[l.wordId]?.category === category
  )
  if (!parts.length) return { word: '', kana: '' }
  if (parts.every((l) => l.slotted === false)) {
    return { word: '', kana: parts[0].kana ?? '' }
  }
  const merged = mergeSources(
    parts.map((l) => ({ ...words[l.wordId], labels: l.labels }))
  )
  return { word: formatNotation(merged, category), kana: parts[0].kana ?? '' }
}

// ── 配信データの番号 1 件 (平たい形) ──

const SLOT_FIELDS = NUMBER_SIDES.flatMap((category) =>
  Array.from(
    { length: SLOTS_PER_SIDE },
    (_, i) => `${SIDE_PREFIX[category]}${i + 1}`
  )
)
// 構造にしていない欄 (画像・割当グラフ)。画像は imageStore、ga は deploy 時の全体集計
const isPassthrough = (key) =>
  key === 'ga' || key.endsWith('Img') || key.endsWith('TagImg')

export const symbolIdOfNumber = (num) =>
  num.length === 4 ? `d:${num}` : `n:${num}`

/** 配信データの番号 1 件 → { symbol, words } */
export function fromNumberEntry(entry) {
  const slotOf = (category, order) => {
    if (order >= SLOTS_PER_SIDE) return undefined
    const key = `${SIDE_PREFIX[category]}${order + 1}`
    return {
      kana: String(entry[`${key}k`] ?? ''),
      filled: Boolean(String(entry[key] ?? '').trim()),
    }
  }
  const { words, links, listLengths } = linksFromLists(entry, slotOf)
  const extras = Object.fromEntries(
    Object.entries(entry).filter(([key]) => isPassthrough(key))
  )
  return {
    symbol: {
      id: symbolIdOfNumber(entry.num),
      kind: entry.num.length === 4 ? 'date' : 'num',
      num: entry.num,
      links,
      listLengths,
      extras,
    },
    words,
  }
}

/** { symbol, words } → 配信データの番号 1 件 (画面が今読んでいる形)。スコアもここで計算する */
export function toNumberEntry(symbol, wordsById) {
  const lists = listsFromLinks(symbol.links, wordsById, symbol.listLengths)
  const slots = Object.fromEntries(
    NUMBER_SIDES.flatMap((category) =>
      Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
        const key = `${SIDE_PREFIX[category]}${i + 1}`
        const { word, kana } = slotFromLinks(
          symbol.links,
          wordsById,
          category,
          i
        )
        return [
          [key, word],
          [`${key}k`, kana],
        ]
      }).flat()
    )
  )
  // 旧名 (w1 = 人の 1 番目 など)。words.js の normalizeSlotFields と同じ対応
  // w1_2 / w2_2 は配信データでは空なら欄ごと無い (generate-preview-data.js の出力に合わせる)
  const aliases = {
    w1: slots.wh1,
    w1k: slots.wh1k,
    w2: slots.wm1,
    w2k: slots.wm1k,
    ...(slots.wh2 ? { w1_2: slots.wh2 } : {}),
    ...(slots.wm2 ? { w2_2: slots.wm2 } : {}),
  }
  const base = { num: symbol.num, ...lists, gainen: '', ...slots, ...aliases }
  // 件数 (hitoCnt など) は画面が読まないので出さない。配信データも catScore だけを持つ
  return {
    ...base,
    catScore: categoryScore(base).catScore,
    ...scoreFields(base),
    ...symbol.extras,
  }
}

export { SLOT_FIELDS }

// ── 番号の文書 (編集・保存キューが読む形) ──

// 文書の欄のうち、語・枠・代表・評価以外はそのまま戻す
const DOC_STRUCTURED = new Set([
  'num',
  'hito',
  'mono',
  'gainen',
  'slots',
  'rep',
  'ratings',
])

/**
 * 番号の文書 → { symbol, words }。
 * 代表・評価は今は «かな + 表記» で語を指しているので、段 1 ではその形のまま持つ
 * (語の id への結び付けは resolveRefs で数えるだけ。置き換えは段 2 以降)
 */
export function fromNumberDoc(doc) {
  const slotOf = (category, order) => {
    if (order >= SLOTS_PER_SIDE) return undefined
    const value = doc.slots?.[`${SIDE_PREFIX[category]}${order + 1}`]
    return {
      kana: String(value?.kana ?? ''),
      filled: Boolean(String(value?.word ?? '').trim()),
    }
  }
  const { words, links, listLengths } = linksFromLists(doc, slotOf)
  const slotExtras = Object.fromEntries(
    Object.entries(doc.slots ?? {}).flatMap(([slot, value]) => {
      const { word: _word, kana: _kana, ...rest } = value ?? {}
      return Object.keys(rest).length ? [[slot, rest]] : []
    })
  )
  const extras = Object.fromEntries(
    Object.entries(doc).filter(([key]) => !DOC_STRUCTURED.has(key))
  )
  return {
    symbol: {
      id: symbolIdOfNumber(doc.num),
      kind: doc.num.length === 4 ? 'date' : 'num',
      num: doc.num,
      links,
      listLengths,
      rep: doc.rep,
      ratings: doc.ratings,
      hasRep: 'rep' in doc,
      hasRatings: 'ratings' in doc,
      hasGainen: 'gainen' in doc,
      gainen: doc.gainen,
      hasSlots: 'slots' in doc,
      slotExtras,
      extras,
    },
    words,
  }
}

/** { symbol, words } → 番号の文書 */
export function toNumberDoc(symbol, wordsById) {
  const lists = listsFromLinks(symbol.links, wordsById, symbol.listLengths)
  const slots = Object.fromEntries(
    NUMBER_SIDES.flatMap((category) =>
      Array.from({ length: SLOTS_PER_SIDE }, (_, i) => {
        const key = `${SIDE_PREFIX[category]}${i + 1}`
        const { word, kana } = slotFromLinks(
          symbol.links,
          wordsById,
          category,
          i
        )
        const extra = symbol.slotExtras?.[key]
        if (!word && !kana && !extra) return []
        return [[key, { word, kana, ...(extra ?? {}) }]]
      }).flat()
    )
  )
  return {
    num: symbol.num,
    ...lists,
    ...(symbol.hasGainen ? { gainen: symbol.gainen } : {}),
    ...(symbol.hasSlots ? { slots } : {}),
    ...(symbol.hasRep ? { rep: symbol.rep } : {}),
    ...(symbol.hasRatings ? { ratings: symbol.ratings } : {}),
    ...symbol.extras,
  }
}

// ── カード ──

const CARD_ROLES = [
  {
    category: 'hito',
    word: 'person',
    act: 'actionP',
    score: 'personScore',
    img: 'personImg',
  },
  {
    category: 'mono',
    word: 'object',
    act: 'actionO',
    score: 'objectScore',
    img: 'objectImg',
  },
  {
    category: 'action',
    word: 'action',
    score: 'actionScore',
    img: 'actionImg',
  },
]

export const symbolIdOfCard = (card) => `c:${card.suit}${card.rank}`

/** 配信データのカード 1 枚 → { symbol, words }。スコア (0〜3) は結び付きの評価に置く */
export function fromCard(card) {
  const parts = CARD_ROLES.flatMap((role) => {
    const raw = String(card[role.word] ?? '').trim()
    if (!raw) return []
    const parsed = parseNotation(raw)
    const word = wordOf(role.category, parsed)
    const link = {
      wordId: word.id,
      order: 0,
      labels: parsed.labels,
      ...(role.act ? { act: card[role.act] ?? '' } : {}),
      rating: card[role.score] ?? null,
    }
    return [{ word, link }]
  })
  // 語のある役割の欄 (語・動作・スコア) は結び付きから戻すので、extras に入れない。
  // ここに入れると往復の検査が «そのまま写しただけ» で通ってしまう。
  // 語の無い役割の欄 (動作だけ・スコアだけ) と画像は、構造にしないのでそのまま戻す
  const linked = new Set(
    CARD_ROLES.filter((role) => String(card[role.word] ?? '').trim()).flatMap(
      (role) => [role.word, role.act, role.score].filter(Boolean)
    )
  )
  const extras = Object.fromEntries(
    Object.entries(card).filter(
      ([key]) => !['suit', 'rank'].includes(key) && !linked.has(key)
    )
  )
  return {
    symbol: {
      id: symbolIdOfCard(card),
      kind: 'card',
      suit: card.suit,
      rank: card.rank,
      links: parts.map((p) => p.link),
      extras,
    },
    words: parts.map((p) => p.word),
  }
}

/** { symbol, words } → 配信データのカード 1 枚 */
export function toCard(symbol, wordsById) {
  const fromLinks = CARD_ROLES.reduce((acc, role) => {
    const link = symbol.links.find(
      (l) => wordsById[l.wordId]?.category === role.category
    )
    if (!link) return acc
    const word = wordsById[link.wordId]
    return {
      ...acc,
      [role.word]: formatNotation(
        { ...word, labels: link.labels },
        role.category
      ),
      ...(role.act ? { [role.act]: link.act ?? '' } : {}),
      [role.score]: link.rating ?? null,
    }
  }, {})
  return {
    suit: symbol.suit,
    rank: symbol.rank,
    ...symbol.extras,
    ...fromLinks,
  }
}

/**
 * 代表・評価の «かな + 表記» が、この記号のどの語を指すか。
 * 表記は 1 項目 (分ける前) のこともあるので、分けた語の表記と、1 項目に戻した表記の両方で引く。
 * 戻り値: [{ kind: 'rep' | 'rating', index, wordIds }] (wordIds が空 = 結び付かない)
 */
export function resolveRefs(symbol, wordsById) {
  const candidates = symbol.links.map((l) => {
    const word = wordsById[l.wordId]
    const own = formatNotation({ ...word, labels: l.labels }, word.category)
    const sameItem = symbol.links
      .filter(
        (o) =>
          o.order === l.order && wordsById[o.wordId]?.category === word.category
      )
      .map((o) => ({ ...wordsById[o.wordId], labels: o.labels }))
    const item = formatNotation(mergeSources(sameItem), word.category)
    return { wordId: l.wordId, kana: l.kana, notations: new Set([own, item]) }
  })
  const find = (k, w) => [
    ...new Set(
      candidates
        .filter(
          (c) =>
            c.notations.has(String(w ?? '')) && (!k || !c.kana || c.kana === k)
        )
        .map((c) => c.wordId)
    ),
  ]
  return [
    ...(symbol.rep?.picks ?? []).map((p, index) => ({
      kind: 'rep',
      index,
      wordIds: find(p.k, p.w),
    })),
    ...(symbol.ratings ?? []).map((r, index) => ({
      kind: 'rating',
      index,
      wordIds: find(r.k, r.w),
    })),
  ]
}

export { byId }
