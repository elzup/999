import { useEffect, useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { fetchHundred, type RepPick } from './numberApi'
import { livePicks } from './numberDetail'
import { slotOfPick, type Slot } from './choice'
import { loadEditorToken } from './editorAuth'
import { useNumberContext } from './numberContext'

export type RepSlotsState = 'loading' | 'ready' | 'error'

/**
 * マップのタイルに出す «代表①» を、百の位 1 つぶん Firestore から読む。
 *
 * 配信データ (data.json) は語の一覧だけで代表を持たないので、編集画面と
 * 同じ API (REQ-NAPI-008) を引く。読めないときは空のまま (= 最初の候補) で描く。
 * 編集画面を閉じるたび (NumberContext の editVersion) に読み直すので、
 * 編集で代表を変えればマップにもそのまま出る。
 */
export function useRepSlots(hundred: number, numbers: NumberEntry[]) {
  const ctx = useNumberContext()
  const editVersion = ctx?.editVersion ?? 0
  const [picks, setPicks] = useState<Record<string, RepPick>>({})
  const [state, setState] = useState<RepSlotsState>('loading')

  useEffect(() => {
    const token = loadEditorToken()
    if (!token) {
      setState('error')
      return
    }
    let alive = true
    setState('loading')
    fetchHundred(hundred, token)
      .then((docs) => {
        if (!alive) return
        const next: Record<string, RepPick> = {}
        for (const doc of docs) {
          const first = livePicks(doc)[0]
          if (first) next[doc.num] = first
        }
        setPicks(next)
        setState('ready')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [hundred, editVersion])

  const slots = useMemo(() => {
    const byNum = new Map(numbers.map((n) => [n.num, n]))
    const out: Record<string, Slot> = {}
    for (const [num, pick] of Object.entries(picks)) {
      const entry = byNum.get(num)
      const slot = entry ? slotOfPick(entry, pick) : null
      if (slot) out[num] = slot
    }
    return out
  }, [picks, numbers])

  return { slots, state }
}
