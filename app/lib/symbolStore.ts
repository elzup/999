// 番号 (と将来はカード・日付) の状態を 1 か所に持つストア。spec: .metarc/state-design.md (段 2)。
//
// 中身は symbol (語を付ける相手) と word (語)。サーバが返した最後の文書を symbol に直して持ち、
// 画面に出す文書は «symbol から戻した文書 + まだ送っていない操作» をここで計算する。
// 以前は画面ごとに «保存キューの変化で数字を 1 増やして描き直す» をしていて、
// マップ (useRepSlots) は保存待ちの操作を知らない自前の写しを持っていた。
//
// 送る順番・送り直し・端末への保存は今までどおり保存キュー (opQueue.ts) が持つ。
// キューは変わるたびに snapshot をここへ渡す (writeQueue.ts)。画面はキューではなくここを読む。
import { createStore } from 'zustand/vanilla'
import {
  byId,
  fromNumberDoc,
  symbolIdOfNumber,
  toNumberDoc,
  type Sym,
  type Word,
} from '../../src/symbols/model.js'
import { canonicalJson } from '../../src/firestore/number-doc.js'
import type { NumberDoc } from './numberApi'
import { applyOpLocally } from './numberDetail'
import {
  applyMoveLocally,
  type PendingOp,
  type QueueSnapshot,
  type SaveMark,
} from './opQueue'
import { sameItems, useStoreSelector } from './storeHook'

export type SymbolStoreState = {
  symbols: Record<string, Sym>
  words: Record<string, Word>
  /**
   * symbol に直すと元に戻らない文書 (そのまま持って、そのまま出す)。
   * 枠 (slots) だけ保存した直後は、人/物の一覧より枠が新しいことがある
   * (console-writes.js の saveSlots は slots だけを書く)。一覧から作る symbol では枠を戻せない
   */
  rawDocs: Record<string, NumberDoc>
  pending: PendingOp[]
  marks: Record<string, SaveMark>
  retrying: boolean
}

export type SymbolStoreActions = {
  /** 保存キューの今の状態を入れる。変わった文書だけ symbol に直す */
  syncQueue: (snapshot: QueueSnapshot) => void
}

export type SymbolStore = SymbolStoreState & SymbolStoreActions

const initial: SymbolStoreState = {
  symbols: {},
  words: {},
  rawDocs: {},
  pending: [],
  marks: {},
  retrying: false,
}

// 文書 → symbol の変換は同じ文書 (オブジェクト) なら 1 回だけ。キューは変わるたびに全件を渡すので
const converted = new WeakMap<
  NumberDoc,
  { symbol: Sym; words: Word[] } | { raw: NumberDoc }
>()

function convert(doc: NumberDoc) {
  const hit = converted.get(doc)
  if (hit) return hit
  const result = fromNumberDoc(doc as Record<string, unknown>)
  const back = toNumberDoc(result.symbol, byId(result.words))
  const value =
    canonicalJson(back) === canonicalJson(doc) ? result : { raw: doc }
  converted.set(doc, value)
  return value
}

export const createSymbolStore = () =>
  createStore<SymbolStore>()((set) => ({
    ...initial,
    syncQueue: (snapshot) =>
      set((state) => {
        const results = snapshot.base.map((doc) => ({ doc, ...convert(doc) }))
        const symbols = Object.fromEntries(
          results.flatMap((r) =>
            'symbol' in r ? [[r.symbol.id, r.symbol as Sym]] : []
          )
        )
        const rawDocs = Object.fromEntries(
          results.flatMap((r) => ('raw' in r ? [[r.doc.num, r.doc]] : []))
        )
        // 語は追加だけ (同じ id なら中身も同じ: model.js の mergeWords)。消えた番号の語が残っても表示は変わらない。
        // 1 語ずつ spread で足すと語の数の 2 乗かかる (1,000 番号で 2 秒) ので、足す分を集めて 1 回で作る
        const added = results.flatMap((r) =>
          'words' in r ? r.words.filter((w) => !state.words[w.id]) : []
        )
        const words = added.length
          ? {
              ...state.words,
              ...Object.fromEntries(added.map((w) => [w.id, w])),
            }
          : state.words
        return {
          symbols: keepSame(state.symbols, symbols),
          rawDocs: keepSame(state.rawDocs, rawDocs),
          words,
          pending: sameItems(state.pending, snapshot.pending)
            ? state.pending
            : snapshot.pending,
          marks: sameRecord(state.marks, snapshot.marks)
            ? state.marks
            : snapshot.marks,
          retrying: snapshot.retrying,
        }
      }),
  }))

/** 中身が同じなら前のオブジェクトを使う (購読している画面を無駄に描き直さない) */
function keepSame<T>(prev: Record<string, T>, next: Record<string, T>) {
  return sameRecord(prev, next) ? prev : next
}

function sameRecord<T>(a: Record<string, T>, b: Record<string, T>) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is(a[key], b[key]))
  )
}

/** アプリで 1 つだけ持つストア */
export const symbolStore = createSymbolStore()

// ── selector ──

// 同じ入力なら同じオブジェクトを返す (購読側の比較が Object.is なので、毎回作ると毎回描き直す)
const baseCache = new WeakMap<Sym, NumberDoc>()
const viewCache = new WeakMap<
  object,
  { pending: PendingOp[]; doc: NumberDoc }
>()

/** サーバが返した最後の文書 (保存待ちを重ねる前) */
function baseDocOf(state: SymbolStoreState, num: string): NumberDoc | null {
  const raw = state.rawDocs[num]
  if (raw) return raw
  const symbol = state.symbols[symbolIdOfNumber(num)]
  if (!symbol) return null
  const hit = baseCache.get(symbol)
  if (hit) return hit
  const doc = toNumberDoc(symbol, state.words) as NumberDoc
  baseCache.set(symbol, doc)
  return doc
}

/** 画面に出す文書 = サーバの最後の文書 + まだ送っていない操作 (opQueue.view と同じ計算) */
export function numberDocOf(
  state: SymbolStoreState,
  num: string
): NumberDoc | null {
  const base = baseDocOf(state, num)
  if (!base) return null
  const own = state.pending.filter((entry) => entry.num === num)
  if (own.length === 0) return base
  const key = state.rawDocs[num] ?? state.symbols[symbolIdOfNumber(num)]
  const hit = viewCache.get(key)
  if (hit && sameItems(hit.pending, own)) return hit.doc
  const doc = own.reduce(
    (current, entry) =>
      entry.op
        ? applyOpLocally(current, entry.op)
        : applyMoveLocally(current, entry.move!),
    base
  )
  viewCache.set(key, { pending: own, doc })
  return doc
}

export const pendingCountOf = (state: SymbolStoreState, num?: string) =>
  state.pending.filter((entry) => !num || entry.num === num).length

export const saveMarkOf = (
  state: Pick<SymbolStoreState, 'marks'>,
  num: string,
  key: string
): SaveMark | undefined => state.marks[`${num}:${key}`]

/** 持っている番号 (読んだことのある番号) */
export const knownNumbersOf = (state: SymbolStoreState) => [
  ...Object.values(state.symbols).flatMap((s) => (s.num ? [s.num] : [])),
  ...Object.keys(state.rawDocs),
]

// ── Preact から読む ──

export const useSymbolStore = <T>(
  selector: (state: SymbolStore) => T,
  equal: (a: T, b: T) => boolean = Object.is
): T => useStoreSelector(symbolStore, selector, equal)

/** 1 番号の、画面に出す文書。読んでいなければ null */
export const useNumberDoc = (num: string) =>
  useSymbolStore((state) => numberDocOf(state, num))

/** 複数の番号の文書 (読んでいない番号は抜く)。並びは nums の順 */
export const useNumberDocs = (nums: readonly string[]) =>
  useSymbolStore(
    (state) =>
      nums
        .map((num) => numberDocOf(state, num))
        .filter((doc): doc is NumberDoc => doc !== null),
    sameItems
  )

/** 保存待ちの操作の数 (num を渡せばその番号だけ) */
export const usePendingCount = (num?: string) =>
  useSymbolStore((state) => pendingCountOf(state, num))

/** 保存の印の表 ("num:key" → 黄/緑/赤)。印を引くのは saveMarkOf で */
export const useSaveMarks = () => useSymbolStore((state) => state.marks)

/** 送り直しを待っている (通信できていない) か */
export const useRetrying = () => useSymbolStore((state) => state.retrying)
