import { useEffect, useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { fetchHundred, type RepPick } from './numberApi'
import { livePicks, nameOf, repStatus, type RepStatus } from './numberDetail'
import { slotOfPick, type Slot } from './choice'
import { loadEditorToken } from './editorAuth'
import { writeQueue } from './writeQueue'
import { useNumberDoc, useNumberDocs } from './symbolStore'

export type RepSlotsState = 'loading' | 'ready' | 'error'

/**
 * 代表 (①②) と確定状態は配信データ (data.json) に無いので、編集画面と同じ
 * API (REQ-NAPI-008) で百の位 1 つぶんずつ Firestore から読む。
 *
 * 読んだ文書は保存キューに入れ (setBases)、画面はストア (symbolStore.ts) から読む。
 * 編集・候補タブで代表を変えると、保存を待たずにマップと詳細カードにも出る
 * (以前は自前の写しを持ち、編集画面を閉じるたびに読み直していた)。
 * 百の位はこのセッションで 1 回だけ読む。自分の保存はキューが返事の文書で差し替える。
 */
const loads = new Map<number, Promise<void>>()

function loadHundred(hundred: number): Promise<void> {
  const token = loadEditorToken()
  if (!token) return Promise.reject(new Error('no token'))
  const hit = loads.get(hundred)
  if (hit) return hit
  const queue = writeQueue()
  // 古い文書と保存待ちの番号は上書きしない (opQueue.ts の putBase)
  const load = fetchHundred(hundred, token).then((docs) => {
    queue.setBases(docs)
  })
  // 失敗は覚えない (次に開いたとき読み直す)
  load.catch(() => loads.delete(hundred))
  loads.set(hundred, load)
  return load
}

/** 百の位 1 つぶんを読み込む。読み込み済みならすぐ ready */
function useHundredLoad(hundred: number | null): RepSlotsState {
  const [state, setState] = useState<RepSlotsState>('loading')
  useEffect(() => {
    if (hundred === null) {
      setState('error')
      return
    }
    let alive = true
    setState('loading')
    loadHundred(hundred)
      .then(() => alive && setState('ready'))
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [hundred])
  return state
}

const numsOfHundred = (hundred: number) =>
  Array.from({ length: 100 }, (_, i) =>
    String(hundred * 100 + i).padStart(3, '0')
  )

/**
 * マップのタイルに出す «代表①» (num → スロット) と、番号ごとの確定状態。
 * 読めないときは空のまま (= 最初の候補) で描く。
 */
export function useRepSlots(hundred: number, numbers: NumberEntry[]) {
  const state = useHundredLoad(hundred)
  const nums = useMemo(() => numsOfHundred(hundred), [hundred])
  const docs = useNumberDocs(nums)

  return useMemo(() => {
    const byNum = new Map(numbers.map((n) => [n.num, n]))
    const slots: Record<string, Slot> = {}
    const status: Record<string, RepStatus> = {}
    for (const doc of docs) {
      status[doc.num] = repStatus(doc)
      const first = livePicks(doc)[0]
      const entry = byNum.get(doc.num)
      const slot = first && entry ? slotOfPick(entry, first) : null
      if (slot) slots[doc.num] = slot
    }
    return { slots, status, state }
  }, [docs, numbers, state])
}

export type RepInfo = {
  status: RepStatus
  /** 今の候補に当たる代表 (①, ②) */
  picks: RepPick[]
}

/**
 * 詳細カード用: 1 番号の代表と確定状態。3 桁でない番号 (10〜12 月の日付) は代表を
 * 持たないので null。読み込み中・読めないときも null (カードは代表なしで描く)
 */
export function useRepInfo(num: string): RepInfo | null {
  const hundred = /^\d{3}$/.test(num) ? Number(num[0]) : null
  useHundredLoad(hundred)
  const doc = useNumberDoc(num)
  return useMemo(
    () => (doc ? { status: repStatus(doc), picks: livePicks(doc) } : null),
    [doc]
  )
}

/** 語 (タグ込み) が代表の何番目か (1, 2)。代表でなければ 0 */
export function repRankOf(info: RepInfo | null, word: string): number {
  if (!info) return 0
  const i = info.picks.findIndex(
    (pick) => pick.w === word || nameOf(pick.w) === nameOf(word)
  )
  return i + 1
}
