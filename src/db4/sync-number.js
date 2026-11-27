// 番号の文書 (旧 DB の形) を 1 件保存するとき、新しい形 (記号 + 語) をどう書き換えるかを決める。
// spec: .metarc/db-design-v4.md / 計画 P2-3・P3-2
//
// 移行中 (P3〜P6) は旧 DB の numbers が正本。新しい形は保存のたびにここで作り直すので、
// 旧と新の値は作りの上で一致する (C7)。決めるのは «語の ID をどれから引き継ぐか» だけ:
//   1. 同じ綴り (本体 + 出典) の語が前の記号にあれば、その ID (並べ替え・人/物の移動で ID が変わらない)
//      同じ綴りが 2 つ (人のトロ / 物のトロ) なら同じ family の方
//   2. 無ければ、同じ位置 (role + order + 出典の順) にいた語の ID (表記の修正で ID が変わらない)
//      ただしその語を他の記号も指しているなら引き継がない。旧 DB では他の記号の綴りは変わらないので、
//      語の文書を書き換えると旧と新がずれる。この記号だけ新しい語に分ける
//   3. 無ければ、他の記号にある同じ表記の語 (D-0178 / D-0179: hex・カードと番号で同じ語を共有する)
//   4. どれも無ければ新しい ID
// 2 は «消して同じ位置に別の語を足した» と区別できない。保存の形 (枠の最終形) に操作の種類が無いため。

import { fromLegacy } from './from-legacy.js'
import { issueWordId } from './ids.js'
import { nearMatch } from './merge-words.js'
import { roleFamily } from './roles.js'

const union = (a = [], b = []) => [...new Set([...a, ...b])]

const familyOf = (links, wordId) =>
  roleFamily(links.find((l) => l.wordId === wordId)?.role)

/** 同じ枠 (role + order) の中での順 (出典 2 つの項目は 1 枠に語が 2 つ) */
const slotIndex = (links, link) =>
  links
    .filter((l) => l.role === link.role && l.order === link.order)
    .indexOf(link)

function claimIds({ temp, tempWords, prevLinks, prevById, sharedIds }) {
  const tempIds = [...new Set(temp.links.map((l) => l.wordId))]
  const prevIds = [...new Set(prevLinks.map((l) => l.wordId))].filter((id) =>
    prevById.has(id)
  )
  const bySpelling = tempIds.reduce((acc, tid) => {
    const word = tempWords.get(tid)
    const used = new Set(acc.values())
    const candidates = prevIds.filter(
      (pid) =>
        !used.has(pid) &&
        prevById.get(pid).text === word.text &&
        prevById.get(pid).source === word.source
    )
    const family = familyOf(temp.links, tid)
    const pick =
      candidates.find((pid) => familyOf(prevLinks, pid) === family) ??
      candidates[0]
    return pick ? new Map([...acc, [tid, pick]]) : acc
  }, new Map())
  return tempIds
    .filter((tid) => !bySpelling.has(tid))
    .reduce((acc, tid) => {
      const used = new Set(acc.values())
      const link = temp.links.find((l) => l.wordId === tid)
      const at = prevLinks.filter(
        (l) => l.role === link.role && l.order === link.order
      )[slotIndex(temp.links, link)]
      const isFree =
        at &&
        prevById.has(at.wordId) &&
        !used.has(at.wordId) &&
        !sharedIds.has(at.wordId)
      return isFree ? new Map([...acc, [tid, at.wordId]]) : acc
    }, bySpelling)
}

/**
 * @param prevSymbol 今の記号 (無ければ null)
 * @param prevWords  今の記号が指す語の文書
 * @param sharedIds  今の記号の語のうち、他の記号も指している語の ID
 * @param nextDoc    保存する番号の文書 (旧 DB の形)
 * @returns {{ symbol, upsertWords, deleteWordIds }}
 *   upsertWords は新しい語と綴りが変わった語だけ。deleteWordIds はどこからも指されなくなった語
 */
export function syncNumber({
  prevSymbol = null,
  prevWords = [],
  sharedIds = new Set(),
  nextDoc,
  /** 番号以外 (カード) のときは fromLegacy の入力 ({ cards: [card] }) を渡す */
  legacy,
  issue = issueWordId,
  /** この記号の外にある、足した語と同じ表記の語 (prepareSymbolWrite が読む) */
  near = [],
  /** near の語 → それを指す記号の [{ id, kind, roles }] */
  nearUsage = new Map(),
}) {
  const draft = fromLegacy(legacy ?? { numbers: [nextDoc] })
  const [temp] = draft.symbols
  const tempWords = new Map(draft.words.map((w) => [w.id, w]))
  const prevById = new Map(prevWords.map((w) => [w.id, w]))
  const prevLinks = prevSymbol?.links ?? []
  const ownClaimed = claimIds({
    temp,
    tempWords,
    prevLinks,
    prevById,
    sharedIds,
  })
  const claimed = [...tempWords.keys()]
    .filter((tid) => !ownClaimed.has(tid))
    .reduce((acc, tid) => {
      const used = new Set(acc.values())
      const match = nearMatch({
        word: tempWords.get(tid),
        role: temp.links.find((l) => l.wordId === tid)?.role,
        symbol: temp,
        near: near.filter((w) => !used.has(w.id)),
        usageOf: nearUsage,
      })
      return match ? new Map([...acc, [tid, match.id]]) : acc
    }, ownClaimed)
  // 語の文書を書き直すときに今の中身 (画像など) を引き継ぐため、結び付けた外の語も引けるようにする
  const knownById = new Map([...near.map((w) => [w.id, w]), ...prevById])
  const idMap = new Map(
    [...tempWords.keys()].map((tid) => [tid, claimed.get(tid) ?? issue()])
  )
  const remap = (id) => idMap.get(id) ?? id
  const links = temp.links.map((l) => ({ ...l, wordId: remap(l.wordId) }))
  const rep = temp.rep && {
    ...temp.rep,
    picks: temp.rep.picks.map((p) =>
      p.wordId ? { ...p, wordId: remap(p.wordId) } : p
    ),
  }
  const symbol = {
    ...temp,
    links,
    ...(rep ? { rep } : {}),
    wordIds: [...new Set(links.map((l) => l.wordId))],
  }
  const upsertWords = [...tempWords.values()].flatMap((word) => {
    const id = remap(word.id)
    const prev = knownById.get(id)
    // 他の記号の語に結び付けたときは、その語のタグと性質を消さない (足し合わせる)。
    // この記号の語の書き換え (タグを外す等) はそのまま反映する
    const isNear = !prevById.has(id) && Boolean(prev)
    const source = isNear ? word.source || prev.source : word.source
    const labels = isNear ? union(prev.labels, word.labels) : word.labels ?? []
    const attrs = isNear ? union(prev.attrs, word.attrs) : word.attrs ?? []
    // 語の性質 (属性・語のラベル) もこの記号の表記から決める (D-0177)。変わったら語を書き直す
    const marksOf = (w) => JSON.stringify([w?.attrs ?? [], w?.labels ?? []])
    const isSame =
      prev &&
      prev.text === word.text &&
      prev.source === source &&
      marksOf(prev) === marksOf({ attrs, labels })
    const { attrs: _a, labels: _l, ...keep } = prev ?? {}
    return isSame
      ? []
      : [
          {
            ...keep,
            id,
            text: word.text,
            source,
            labels,
            ...(attrs.length ? { attrs } : {}),
          },
        ]
  })
  const kept = new Set(symbol.wordIds)
  const deleteWordIds = [...prevById.keys()].filter(
    (id) => !kept.has(id) && !sharedIds.has(id)
  )
  return { symbol, upsertWords, deleteWordIds }
}
