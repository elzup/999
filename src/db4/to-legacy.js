// v4 の記号 → 今の形 (numbers の文書・カード・FF)。移行中の写しと、往復の検査に使う。
// 番号の一覧の文字列 (hito / mono) は保存せず、ここで毎回作る (db-design-v4.md J4)。

import { itemsOfSymbol } from './items.js'

const SIDES = [
  { role: 'hito', prefix: 'wh' },
  { role: 'mono', prefix: 'wm' },
]
const SLOTS_PER_SIDE = 3

/** 末尾の空だけ落として連結する (sheet-bisync の joinItems と同じ) */
function joinItems(items) {
  const end = items.findLastIndex((item) => item !== '')
  return items.slice(0, end + 1).join(',')
}

function refOf(items, wordId) {
  const item = items.find((i) => i.links.some((l) => l.wordId === wordId))
  return item
    ? { ...(item.kana !== undefined ? { k: item.kana } : {}), w: item.notation }
    : null
}

function sideOf(symbol, items, { role, prefix }) {
  const own = items.filter((i) => i.role === role)
  const kanaOnly = (symbol.kanaOnly ?? []).filter((k) => k.role === role)
  const length = Math.max(
    0,
    ...own.map((i) => i.order + 1),
    ...kanaOnly.map((k) => k.order + 1)
  )
  const list = Array.from(
    { length },
    (_, order) => own.find((i) => i.order === order)?.notation ?? ''
  )
  const slots = Array.from({ length: SLOTS_PER_SIDE }, (_, order) => {
    const item = own.find((i) => i.order === order)
    const kana = kanaOnly.find((k) => k.order === order)
    if (!item && !kana) return []
    const first = item?.links[0]
    return [
      [
        `${prefix}${order + 1}`,
        {
          word: item?.notation ?? '',
          kana: item?.kana ?? kana?.kana ?? '',
          ...(first && 'imageUrl' in first ? { imageUrl: first.imageUrl } : {}),
          ...(first?.slotExtras ?? kana?.slotExtras ?? {}),
        },
      ],
    ]
  }).flat()
  return { list: joinItems(list), slots }
}

export function toNumberDoc(symbol, wordsById) {
  const items = itemsOfSymbol(symbol, wordsById)
  const sides = SIDES.map((side) => sideOf(symbol, items, side))
  const rated = symbol.links.filter((l) => l.rating !== undefined)
  const rep = symbol.rep
    ? {
        ...symbol.rep,
        picks: symbol.rep.picks.map((p) =>
          p.wordId ? refOf(items, p.wordId) : p
        ),
      }
    : undefined
  return {
    num: symbol.id.slice('num:'.length),
    hito: sides[0].list,
    mono: sides[1].list,
    slots: Object.fromEntries(sides.flatMap((s) => s.slots)),
    ...(rep ? { rep } : {}),
    ...(symbol.looseRatings !== undefined
      ? {
          ratings: [
            ...rated.map((l) => ({ ...refOf(items, l.wordId), v: l.rating })),
            ...symbol.looseRatings,
          ],
        }
      : {}),
    ...symbol.extras,
    ...(symbol.updatedAt !== undefined ? { updatedAt: symbol.updatedAt } : {}),
    ...(symbol.source !== undefined ? { source: symbol.source } : {}),
  }
}

const CARD_FIELDS = [
  { role: 'P', word: 'person', act: 'actionP', score: 'personScore' },
  { role: 'O', word: 'object', act: 'actionO', score: 'objectScore' },
  { role: 'A', word: 'action', score: 'actionScore' },
]

export function toCard(symbol, wordsById) {
  const items = itemsOfSymbol(symbol, wordsById)
  const [, suit, rank] = symbol.id.match(/^card:([SHCD])(.+)$/)
  const fields = CARD_FIELDS.flatMap((f) => {
    const item = items.find((i) => i.role === f.role)
    if (!item) return []
    const first = item.links[0]
    return [
      [f.word, item.notation],
      ...(f.act ? [[f.act, first.act ?? '']] : []),
      [f.score, first.rating ?? null],
    ]
  })
  return { suit, rank, ...symbol.extras, ...Object.fromEntries(fields) }
}

export function toFf(symbol, wordsById) {
  const [item] = itemsOfSymbol(symbol, wordsById)
  return {
    hex: symbol.id.slice('hex:'.length),
    ...(item ? { word: item.notation, kana: item.kana } : { word: '' }),
    ...symbol.extras,
  }
}
