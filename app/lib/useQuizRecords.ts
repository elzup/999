import { useState, useCallback, useMemo } from 'preact/hooks'
import type { Record as TestRecord } from '../data/schema'
import { loadRecords, saveRecords } from '../data/storage'

const MAX_RECORDS = 50

/**
 * テスト記録(スコア履歴)の共有エンジン。
 * storageKey ごとに localStorage 永続化し、追加/削除/全消し・前回/最高を提供。
 * RecordPanel と組み合わせて各テストの「記録」を共通化する。
 */
export function useQuizRecords(storageKey: string) {
  const [records, setRecords] = useState<TestRecord[]>(() =>
    loadRecords(storageKey)
  )

  const persist = useCallback(
    (updater: (prev: TestRecord[]) => TestRecord[]) => {
      setRecords((prev) => {
        const next = updater(prev)
        saveRecords(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  const addRecord = useCallback(
    (r: { score: number; total: number; time: number }) => {
      const rec: TestRecord = {
        date: new Date().toISOString(),
        score: r.score,
        total: r.total,
        time: r.time,
        mode: 'check',
      }
      persist((prev) => [rec, ...prev].slice(0, MAX_RECORDS))
    },
    [persist]
  )

  const deleteRecord = useCallback(
    (idx: number) => persist((prev) => prev.filter((_, i) => i !== idx)),
    [persist]
  )

  const clearRecords = useCallback(() => persist(() => []), [persist])

  const last = records[0] ?? null
  const best = useMemo(
    () =>
      records.reduce<TestRecord | null>(
        (b, r) => (!b || r.score > b.score ? r : b),
        null
      ),
    [records]
  )

  return { records, addRecord, deleteRecord, clearRecords, last, best }
}
