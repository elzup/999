import { useCallback, useState } from 'preact/hooks'
import type { ReviewItem } from '../components/ReviewPanel'

/**
 * テスト中に «あとで見返す» 印を付ける。そのテスト 1 回限りの使い捨て。
 *
 * ★ (ブックマーク) の状態はテスト中に出さない。出すと «★ が付いている = 苦手» が
 * 答えのヒントになる。★ は結果ビューで個別に付ける。
 * 問題は振り返り行と同じ label で識別する (結果を組む側が index を持たないテストもある)。
 */
export function useReviewMarks() {
  const [marks, setMarks] = useState<Set<string>>(() => new Set())

  const toggle = useCallback((label: string) => {
    setMarks((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const reset = useCallback(() => setMarks(new Set()), [])

  return { marks, toggle, reset }
}

/** 振り返り行に印を写す */
export function applyMarks(
  items: ReviewItem[],
  marks: Set<string>
): ReviewItem[] {
  return items.map((item) => ({ ...item, marked: marks.has(item.label) }))
}
