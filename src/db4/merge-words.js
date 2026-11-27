// 同じ表記の語を 1 つにまとめる (D-0178)。1 回だけの移行と、保存のときの語の引き当ての両方で使う。
//
// 決まり:
//   - 表記 (text) と出典 (source) が同じなら同じ語。分けるのは人 (person) と物 (thing) だけ
//   - hex・行動 (action) の語は、同じ表記の人の語があればそれに、無ければ物の語にまとめる
//   - ただし 1 語は同じ kind の記号に 1 回まで (C9: 番号 2 つで同じ語は登録のミス、D-0165)。
//     まとめると C9 か C5 (同じ枠に同じ語が 2 回) に反する語はまとめずに残す
import { roleFamily } from './roles.js'

const MERGE_FAMILIES = ['person', 'thing']

export const spellingKey = (word) => `${word.text}|${word.source ?? ''}`

/** 語が使われている所: role の集まりと、kind ごとの記号・枠 */
function usageOf(symbols) {
  return symbols.reduce((acc, symbol) => {
    for (const link of symbol.links) {
      const prev = acc.get(link.wordId) ?? { roles: new Set(), places: [] }
      acc.set(link.wordId, {
        roles: new Set([...prev.roles, link.role]),
        places: [
          ...prev.places,
          {
            kind: symbol.kind,
            symbolId: symbol.id,
            slot: `${link.role}:${link.order}`,
          },
        ],
      })
    }
    return acc
  }, new Map())
}

/** 人・物のどちらに属すか。どちらでもない (hex・行動だけ) 語は、表記の仲間にある方へ寄せる */
function familyOf(roles, groupFamilies) {
  const own = MERGE_FAMILIES.find((f) =>
    [...roles].some((r) => roleFamily(r) === f)
  )
  if (own) return own
  const near = MERGE_FAMILIES.find((f) => groupFamilies.has(f))
  return near ?? roleFamily([...roles][0])
}

/** 2 語を 1 つにしてよいか (C9: 同じ kind の別の記号 / C5: 同じ記号の同じ枠 があれば駄目) */
const canJoin = (placesA, placesB) =>
  placesA.every((a) =>
    placesB.every(
      (b) =>
        a.kind !== b.kind || (a.symbolId === b.symbolId && a.slot !== b.slot)
    )
  )

/** 仲間 (同じ表記・同じ family) を、まとめてよい組に分ける。使われている数の多い語を代表にする */
function bucketsOf(ids, usage, tagged) {
  const sorted = ids.toSorted(
    (a, b) =>
      Number(tagged.has(b)) - Number(tagged.has(a)) ||
      (usage.get(b)?.places.length ?? 0) - (usage.get(a)?.places.length ?? 0) ||
      a.localeCompare(b)
  )
  return sorted.reduce((buckets, id) => {
    const places = usage.get(id)?.places ?? []
    const at = buckets.findIndex((b) => canJoin(b.places, places))
    if (at < 0) return [...buckets, { ids: [id], places }]
    return buckets.map((b, i) =>
      i === at ? { ids: [...b.ids, id], places: [...b.places, ...places] } : b
    )
  }, [])
}

/**
 * 表記ごとの仲間。タグ違いは別物なので出典ごとに分け、タグ無しの語はタグ付きの仲間に入れる。
 * タグ付きが複数あれば、価値の高いタグ (そのタグの語が多い方) に入れる (D-0179)
 */
function spellingGroups(words) {
  const tagSize = words.reduce(
    (acc, w) =>
      w.source ? acc.set(w.source, (acc.get(w.source) ?? 0) + 1) : acc,
    new Map()
  )
  return Object.values(Object.groupBy(words, (w) => w.text)).flatMap((same) => {
    const bySource = Object.groupBy(same, (w) => w.source ?? '')
    const { '': untagged = [], ...tagged } = bySource
    const best = Object.keys(tagged).toSorted(
      (a, b) =>
        (tagSize.get(b) ?? 0) - (tagSize.get(a) ?? 0) || a.localeCompare(b)
    )[0]
    if (!best) return [untagged]
    return Object.entries(tagged).map(([source, list]) =>
      source === best ? [...list, ...untagged] : list
    )
  })
}

/** @returns Map<まとめられる語の ID, まとめ先の ID> */
export function mergePlan({ symbols, words }) {
  const usage = usageOf(symbols)
  const groups = spellingGroups(words)
  const pairs = groups.flatMap((group) => {
    if (group.length < 2) return []
    const familiesOf = (w) =>
      [...(usage.get(w.id)?.roles ?? [])].map((r) => roleFamily(r))
    const groupFamilies = new Set(group.flatMap(familiesOf))
    const byFamily = Object.groupBy(group, (w) =>
      familyOf(usage.get(w.id)?.roles ?? new Set(), groupFamilies)
    )
    // まとめ先はタグ付きの語 (タグ無しをまとめ先にするとタグが消える)
    const tagged = new Set(group.filter((w) => w.source).map((w) => w.id))
    return Object.values(byFamily).flatMap((members) =>
      bucketsOf(
        members.map((w) => w.id),
        usage,
        tagged
      ).flatMap(({ ids: [keep, ...rest] }) => rest.map((id) => [id, keep]))
    )
  })
  return new Map(pairs)
}

/**
 * 保存のとき: この記号に新しく足した語を、他の記号にある同じ表記の語に結び付けるか (D-0178 / D-0179)。
 * @param word    新しく足した語 ({ text, source })
 * @param role    その語の結び付きの role
 * @param symbol  保存する記号 ({ id, kind })
 * @param near    同じ表記の語 (この記号の外にあるもの)
 * @param usageOf 語の ID → それを指す記号の [{ id, kind, roles }]
 * @returns 結び付ける語 (無ければ undefined)
 */
export function nearMatch({ word, role, symbol, near, usageOf: usage }) {
  const family = roleFamily(role)
  const familiesOf = (w) =>
    new Set(
      (usage.get(w.id) ?? []).flatMap((u) => u.roles.map((r) => roleFamily(r)))
    )
  // C9: 同じ kind の別の記号が使っている語には結び付けない
  const isFree = (w) =>
    (usage.get(w.id) ?? []).every(
      (u) => u.kind !== symbol.kind || u.id === symbol.id
    )
  const fits = (w) => {
    const fams = familiesOf(w)
    const isPersonOrThing = MERGE_FAMILIES.includes(family)
    // 人・物の語は同じ側か、まだ人・物に属さない語 (hex・行動だけ) に。hex・行動の語は人 → 物の順に寄せる
    return isPersonOrThing
      ? fams.has(family) || !MERGE_FAMILIES.some((f) => fams.has(f))
      : true
  }
  const sourceOk = (w) =>
    (w.source ?? '') === (word.source ?? '') || (!word.source && w.source)
  const rank = (w) => {
    const fams = familiesOf(w)
    return [
      // 同じ出典を先に、次にタグ付き (タグ無しの語はタグ付きにまとめる)
      (w.source ?? '') === (word.source ?? '') ? 0 : 1,
      MERGE_FAMILIES.includes(family)
        ? fams.has(family)
          ? 0
          : 1
        : fams.has('person')
        ? 0
        : fams.has('thing')
        ? 1
        : 2,
      // タグの価値の代わりに、使われている数の多い語
      -(usage.get(w.id)?.length ?? 0),
    ]
  }
  const byRank = (a, b) => {
    const [ra, rb] = [rank(a), rank(b)]
    return (
      ra[0] - rb[0] ||
      ra[1] - rb[1] ||
      ra[2] - rb[2] ||
      a.id.localeCompare(b.id)
    )
  }
  return near
    .filter((w) => w.text === word.text)
    .filter(sourceOk)
    .filter(isFree)
    .filter(fits)
    .toSorted(byRank)[0]
}

const union = (a = [], b = []) => [...new Set([...a, ...b])]

/** まとめた後の記号と語。語の性質 (属性・ラベル) は足し合わせ、画像はまとめ先を優先する */
export function applyMerge({ symbols, words }, plan) {
  const to = (id) => plan.get(id) ?? id
  const nextSymbols = symbols.map((symbol) => {
    const links = symbol.links.map((l) => ({ ...l, wordId: to(l.wordId) }))
    const picks = symbol.rep?.picks
      ?.map((p) => (p.wordId ? { ...p, wordId: to(p.wordId) } : p))
      .filter(
        (p, i, all) =>
          !p.wordId || all.findIndex((q) => q.wordId === p.wordId) === i
      )
    return {
      ...symbol,
      links,
      wordIds: [...new Set(links.map((l) => l.wordId))],
      ...(symbol.rep ? { rep: { ...symbol.rep, picks } } : {}),
    }
  })
  const byId = new Map(words.map((w) => [w.id, w]))
  const absorbed = [...plan].reduce((acc, [from, keep]) => {
    const base = acc.get(keep) ?? byId.get(keep)
    const other = byId.get(from)
    const attrs = union(base.attrs, other.attrs)
    return new Map([
      ...acc,
      [
        keep,
        {
          ...base,
          labels: union(base.labels, other.labels),
          ...(attrs.length ? { attrs } : {}),
          ...(base.imageUrl || !other.imageUrl
            ? {}
            : { imageUrl: other.imageUrl }),
        },
      ],
    ])
  }, new Map())
  const nextWords = words
    .filter((w) => !plan.has(w.id))
    .map((w) => absorbed.get(w.id) ?? w)
  return {
    symbols: nextSymbols,
    words: nextWords,
    removedIds: [...plan.keys()],
    changedWordIds: [...absorbed.keys()],
  }
}
