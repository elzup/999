// 今の形 (numbers の文書・カード・FF) → v4 の { symbols, words }。移行で 1 回だけ使う。
// spec: .metarc/db-design-v4.md / D-0163 (最初だけ自動で寄せる) / D-0164 (語の ID)
//
// 番号の語は «1〜3 番目 = 枠 (slots)、4 番目以降 = 一覧の文字列»。一覧の 1〜3 番目は読まない
// (アプリの語編集は枠だけを書くので古いことがある。2026-11-26 の事故の原因: incident-symbols-switch)。

import { migrationWordId, symbolIdOf } from './ids.js'
import { parseItem } from './notation.js'
import { resolveRefs } from './refs.js'
import { roleFamily } from './roles.js'

const SIDES = [
  { role: 'hito', prefix: 'wh' },
  { role: 'mono', prefix: 'wm' },
]
const SLOTS_PER_SIDE = 3
const NUMBER_STRUCTURED = new Set([
  'num',
  'hito',
  'mono',
  'slots',
  'rep',
  'ratings',
  'updatedAt',
  'source',
  'derived',
])
const CARD_FIELDS = [
  { role: 'P', word: 'person', act: 'actionP', score: 'personScore' },
  { role: 'O', word: 'object', act: 'actionO', score: 'objectScore' },
  { role: 'A', word: 'action', score: 'actionScore' },
]

const groupBy = (list, keyOf) =>
  list.reduce((acc, item) => {
    const key = keyOf(item)
    return acc.set(key, [...(acc.get(key) ?? []), item])
  }, new Map())

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()
const itemsOfList = (list) =>
  text(list) === ''
    ? []
    : text(list)
        .split(',')
        .map((item) => item.trim())

/** 1 項目 → 結び付きの下書き (出典ごと)。値 (kana など) は先頭の部品にだけ載せる */
function draftLinks(raw, role, order, values = {}) {
  return parseItem(raw, role).map((part, i) => ({
    role,
    order,
    part,
    ...(i === 0
      ? values
      : { ...(values.kana !== undefined ? { kana: values.kana } : {}) }),
  }))
}

function numberSideLinks(doc, { role, prefix }) {
  // 枠は詰めて読む (sheet-bisync の packGroup と同じ)。本番の中抜けは 0 件 (2026-11-26)
  const filled = Array.from(
    { length: SLOTS_PER_SIDE },
    (_, i) => doc.slots?.[`${prefix}${i + 1}`]
  ).filter((slot) => text(slot?.word) !== '' || text(slot?.kana) !== '')
  const slotLinks = filled.flatMap((slot, order) =>
    draftLinks(slot.word, role, order, {
      kana: text(slot.kana),
      ...('imageUrl' in slot ? { imageUrl: slot.imageUrl } : {}),
    })
  )
  const kanaOnly = filled.flatMap((slot, order) =>
    text(slot.word) === '' ? [{ role, order, kana: text(slot.kana) }] : []
  )
  const listLinks = itemsOfList(doc[role])
    .slice(SLOTS_PER_SIDE)
    .flatMap((raw, i) => draftLinks(raw, role, SLOTS_PER_SIDE + i))
  return { links: [...slotLinks, ...listLinks], kanaOnly }
}

function numberDraft(doc) {
  const sides = SIDES.map((side) => numberSideLinks(doc, side))
  const extras = Object.fromEntries(
    Object.entries(doc).filter(([key]) => !NUMBER_STRUCTURED.has(key))
  )
  return {
    id: symbolIdOf.num(doc.num),
    kind: 'num',
    links: sides.flatMap((s) => s.links),
    kanaOnly: sides.flatMap((s) => s.kanaOnly),
    legacyRefs: { rep: doc.rep, ratings: doc.ratings },
    extras,
    updatedAt: doc.updatedAt,
    source: doc.source,
  }
}

function cardDraft(card) {
  const used = CARD_FIELDS.filter((f) => text(card[f.word]) !== '')
  const links = used.flatMap((f) =>
    draftLinks(card[f.word], f.role, 0, {
      ...(f.act ? { act: card[f.act] ?? '' } : {}),
      ...(card[f.score] === null || card[f.score] === undefined
        ? {}
        : { rating: card[f.score] }),
    })
  )
  const linked = new Set(
    used.flatMap((f) => [f.word, f.act, f.score].filter(Boolean))
  )
  const extras = Object.fromEntries(
    Object.entries(card).filter(
      ([key]) => !['suit', 'rank'].includes(key) && !linked.has(key)
    )
  )
  return {
    id: symbolIdOf.card(card.suit, card.rank),
    kind: 'card',
    links,
    kanaOnly: [],
    extras,
  }
}

function ffDraft(entry) {
  const { hex, word, kana, ...rest } = entry
  const links = draftLinks(word, 'hex', 0, { kana: text(kana) })
  return {
    id: symbolIdOf.hex(hex),
    kind: 'hex',
    links,
    kanaOnly: [],
    extras: links.length ? rest : { ...rest, kana },
  }
}

/**
 * 同じ綴り (本体 + 出典) の語を寄せて ID を決める。同じ記号の中で別の family
 * (人と物) に同じ綴りがあれば、その綴りは family ごとに別の語にする
 */
function assignWords(drafts) {
  const occurrences = drafts.flatMap((symbol) =>
    symbol.links.map((link) => ({
      symbol: symbol.id,
      key: `${link.part.text}|${link.part.source}`,
      text: link.part.text,
      source: link.part.source,
      family: roleFamily(link.role),
      at: `${symbol.id}:${link.role}:${link.order}`,
    }))
  )
  const byKey = groupBy(occurrences, (o) => o.key)
  const clusterOf = (o) => {
    const group = byKey.get(o.key)
    const isSplit = group.some((a) =>
      group.some((b) => a.symbol === b.symbol && a.family !== b.family)
    )
    return isSplit ? `${o.key}#${o.family}` : o.key
  }
  const byCluster = groupBy(occurrences, clusterOf)
  const idOfCluster = new Map(
    [...byCluster].map(([cluster, list]) => {
      const first = list.map((o) => o.at).sort()[0]
      return [
        cluster,
        migrationWordId(`${list[0].text}|${list[0].source}|${first}`),
      ]
    })
  )
  return { clusterOf, idOfCluster }
}

/** @returns {{ symbols, words, report }} */
export function fromLegacy({ numbers = [], cards = [], ff = [] }) {
  const drafts = [
    ...numbers.map(numberDraft),
    ...cards.map(cardDraft),
    ...ff.map(ffDraft),
  ]
  const { clusterOf, idOfCluster } = assignWords(drafts)
  const words = new Map()
  const symbols = drafts.map((draft) => {
    const links = draft.links.map((link) => {
      const { part, ...rest } = link
      const wordId = idOfCluster.get(
        clusterOf({
          key: `${part.text}|${part.source}`,
          family: roleFamily(link.role),
          symbol: draft.id,
        })
      )
      const seen = words.get(wordId)
      if (seen && (seen.text !== part.text || seen.source !== part.source)) {
        throw new Error(`語の ID が重なった: ${wordId}`)
      }
      if (!seen)
        words.set(wordId, {
          id: wordId,
          text: part.text,
          source: part.source,
          labels: [],
        })
      const { text: _t, source: _s, ...layout } = part
      return { wordId, ...rest, ...layout }
    })
    const { legacyRefs, ...symbol } = { ...draft, links }
    const resolved = resolveRefs(symbol, legacyRefs, [...words.values()])
    return {
      ...resolved.symbol,
      wordIds: [...new Set(resolved.symbol.links.map((l) => l.wordId))],
    }
  })
  return { symbols, words: [...words.values()] }
}
