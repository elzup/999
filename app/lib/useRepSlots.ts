import { useEffect, useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { fetchHundred, type NumberDoc, type RepPick } from './numberApi'
import { livePicks, nameOf, repStatus, type RepStatus } from './numberDetail'
import { slotOfPick, type Slot } from './choice'
import { loadEditorToken } from './editorAuth'
import { useNumberContext } from './numberContext'
import { editorQueue } from './editorQueue'

export type RepSlotsState = 'loading' | 'ready' | 'error'

/**
 * 代表 (①②) と確定状態は配信データ (data.json) に無いので、編集画面と同じ
 * API (REQ-NAPI-008) で百の位 1 つぶんずつ Firestore から読む。
 *
 * マップと詳細カードが同じ百の位を何度も引かないよう、ここで共有する。
 * 編集画面を閉じるたび (NumberContext の editVersion) に読み直すので、
 * 編集で代表を変えればマップにも詳細カードにもそのまま出る。
 */
const cache = new Map<string, Promise<NumberDoc[]>>()

function loadHundred(hundred: number, version: number): Promise<NumberDoc[]> {
  const token = loadEditorToken()
  if (!token) return Promise.reject(new Error('no token'))
  const key = `${hundred}:${version}`
  let hit = cache.get(key)
  if (!hit) {
    hit = fetchHundred(hundred, token)
    // 編集画面にも渡しておく (詳細カードから «編集» を開いたとき待たない)
    hit.then((docs) => editorQueue().seed(docs)).catch(() => {})
    // 失敗は覚えない (次に開いたとき読み直す)
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

/** 百の位 1 つぶんの番号ドキュメント (num → doc)。読めなければ null */
function useHundredDocs(hundred: number | null) {
  const ctx = useNumberContext()
  const version = ctx?.editVersion ?? 0
  const [docs, setDocs] = useState<Map<string, NumberDoc> | null>(null)
  const [state, setState] = useState<RepSlotsState>('loading')

  useEffect(() => {
    if (hundred === null) {
      setDocs(null)
      setState('error')
      return
    }
    let alive = true
    setState('loading')
    loadHundred(hundred, version)
      .then((list) => {
        if (!alive) return
        setDocs(new Map(list.map((doc) => [doc.num, doc])))
        setState('ready')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [hundred, version])

  return { docs, state }
}

/**
 * マップのタイルに出す «代表①» (num → スロット) と、番号ごとの確定状態。
 * 読めないときは空のまま (= 最初の候補) で描く。
 */
export function useRepSlots(hundred: number, numbers: NumberEntry[]) {
  const { docs, state } = useHundredDocs(hundred)

  return useMemo(() => {
    const byNum = new Map(numbers.map((n) => [n.num, n]))
    const slots: Record<string, Slot> = {}
    const status: Record<string, RepStatus> = {}
    for (const [num, doc] of docs ?? []) {
      status[num] = repStatus(doc)
      const first = livePicks(doc)[0]
      const entry = byNum.get(num)
      const slot = first && entry ? slotOfPick(entry, first) : null
      if (slot) slots[num] = slot
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
  const { docs } = useHundredDocs(hundred)
  const doc = docs?.get(num)
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
