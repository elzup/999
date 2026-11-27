// 番号を保存する transaction の中で、新しい形 (symbols / words) も書く口 (計画 P3-2・P3-3)。
// 旧 DB (numbers) の書き込みと同じ transaction なので、片方だけ進むことは無い。
//
// Firestore の transaction は «読みを全部済ませてから書く» 決まりがあるので 2 段に分ける:
//   prepare (numbers を書く前): 今の記号・その語・その語を指す他の記号を読む
//   commit  (numbers を書いた後): syncNumber で作り直し、形と整合を確かめてから書く
// 違反があれば投げる。呼ぶ側の transaction ごと止まり、numbers にも書かない (P3-4: 書かずに止める)
//
// io は Admin SDK と REST の違いを隠す最小の口 (文書は { id, ...中身 } の形で返す):
//   getDocs(col, ids) → [doc|undefined]  / findSymbolsUsing(wordIds) → [symbol]
//   set(col, id, data) / remove(col, id)

import { symbolIdOf } from './ids.js'
import { checkIntegrity } from './integrity.js'
import { shapeErrors } from './schema.js'
import {
  CHANGE_DOC,
  SNAPSHOTS,
  snapshotEntryOf,
  snapshotIdOf,
} from './snapshot.js'
import { fromLegacy } from './from-legacy.js'
import { syncNumber } from './sync-number.js'
import { decodeWords, encodeWords, TAGS } from './tag-codec.js'

export const SYMBOLS = 'symbols'
export const WORDS = 'words'

/** 新しい形にも書くか。P5 (本番に新しい形を作る) までは既定で書かない */
export const isDb4WriteOn = () => process.env.DB4_WRITE === 'on'

export class Db4WriteError extends Error {
  constructor(problems) {
    super(`新しい形に書けない: ${problems.slice(0, 5).join(' / ')}`)
    this.problems = problems
  }
}

// Firestore は undefined を受け付けない
const clean = (value) => JSON.parse(JSON.stringify(value))
const withoutId = ({ id: _id, ...rest }) => rest

export const prepareNumberWrite = (io, num, doc) =>
  prepareSymbolWrite(io, symbolIdOf.num(num), doc && { numbers: [doc] })

/**
 * 記号 1 つの今の値 (番号・カード共通)。
 * legacy (保存する中身。fromLegacy の入力) を渡すと、その語と同じ表記の、他の記号の語も読む (D-0178)
 */
export async function prepareSymbolWrite(io, symbolId, legacy) {
  const [prevSymbol] = await io.getDocs(SYMBOLS, [symbolId])
  const prevIds = prevSymbol?.wordIds ?? []
  // 出典タグは全部読む (143 件ほど)。語の sourceId をコードに戻し、新しいコードのタグを作るため
  const tags = await io.listTags()
  const prevWords = decodeWords(
    (await io.getDocs(WORDS, prevIds)).filter(Boolean),
    tags
  )
  const others = prevIds.length
    ? (await io.findSymbolsUsing(prevIds)).filter((s) => s.id !== symbolId)
    : []
  const sharedIds = new Set(others.flatMap((s) => s.wordIds ?? []))
  const { near, nearUsage } = await readNear(io, legacy, prevIds, tags)
  // 読む形の写し (100 番号ずつ / カード)。この記号の行だけ書き換えるので、今の中身を読む
  const snapshotId = snapshotIdOf(symbolId)
  const [snapshot] = snapshotId
    ? await io.getDocs(SNAPSHOTS, [snapshotId])
    : [null]
  return {
    symbolId,
    snapshotId,
    snapshot: snapshot ?? null,
    prevSymbol: prevSymbol ?? null,
    prevWords,
    sharedIds,
    tags,
    near,
    nearUsage,
  }
}

/** 保存する語と同じ表記の、他の記号の語と、それを指す記号 (語の ID → [{ id, kind, roles }]) */
async function readNear(io, legacy, prevIds, tags) {
  const empty = { near: [], nearUsage: new Map() }
  if (!legacy || !io.findWordsByText) return empty
  const texts = [...new Set(fromLegacy(legacy).words.map((w) => w.text))]
  if (!texts.length) return empty
  const own = new Set(prevIds)
  const near = decodeWords(
    (await io.findWordsByText(texts)).filter((w) => !own.has(w.id)),
    tags
  )
  if (!near.length) return empty
  const users = await io.findSymbolsUsing(near.map((w) => w.id))
  const nearUsage = new Map(
    near.map((w) => [
      w.id,
      users
        .filter((s) => (s.wordIds ?? []).includes(w.id))
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          roles: s.links.filter((l) => l.wordId === w.id).map((l) => l.role),
        })),
    ])
  )
  return { near, nearUsage }
}

/** @returns {{ symbol, upsertWords, deleteWordIds }} 書いた中身 */
/** カードなど番号以外: legacy は fromLegacy の入力 ({ cards: [card] }) */
export const commitSymbolWrite = (io, plan, legacy) =>
  commitNumberWrite(io, plan, undefined, legacy)

export function commitNumberWrite(io, plan, nextDoc, legacy) {
  const result = syncNumber({
    prevSymbol: plan.prevSymbol,
    prevWords: plan.prevWords,
    sharedIds: plan.sharedIds,
    nextDoc,
    legacy,
    near: plan.near,
    nearUsage: plan.nearUsage,
  })
  const upserted = new Map(result.upsertWords.map((w) => [w.id, w]))
  const linkedWords = result.symbol.wordIds.map(
    (id) =>
      upserted.get(id) ??
      plan.prevWords.find((w) => w.id === id) ??
      plan.near?.find((w) => w.id === id)
  )
  const encoded = encodeWords(result.upsertWords, plan.tags)
  const shape = shapeErrors({
    symbols: [result.symbol],
    words: encoded.docs,
    tags: encoded.newTags,
  })
  // 記号 1 つと、その語だけで見る (C2 = 他の記号の語は見えないので数えない)
  const { errors } = checkIntegrity({
    symbols: [result.symbol],
    words: linkedWords.filter(Boolean),
  })
  const problems = [...shape, ...errors.map((e) => `${e.rule} ${e.detail}`)]
  if (problems.length) throw new Db4WriteError(problems)
  io.set(SYMBOLS, plan.symbolId, clean(withoutId(result.symbol)))
  for (const tag of encoded.newTags) io.set(TAGS, tag.id, withoutId(tag))
  for (const word of encoded.docs)
    io.set(WORDS, word.id, clean(withoutId(word)))
  for (const id of result.deleteWordIds) io.remove(WORDS, id)
  const entry =
    plan.snapshotId &&
    snapshotEntryOf(
      result.symbol,
      Object.fromEntries(linkedWords.filter(Boolean).map((w) => [w.id, w]))
    )
  if (entry) {
    const docs = { ...(plan.snapshot?.docs ?? {}), [entry[0]]: entry[1] }
    io.set(SNAPSHOTS, plan.snapshotId, clean({ docs }))
  }
  io.set(CHANGE_DOC.col, CHANGE_DOC.id, { at: new Date().toISOString() })
  return result
}
