import { BM_STALE_MS } from '../data/storage'

/**
 * 復習リマインドの判定。全ブックマークのうち最も長く詳細を開いていないものが
 * 閾値(1週間)を超えていたら true。ブックマークが空なら false。
 * 追加時に閲覧時刻を記録するため、未記録キーは「古い(0)」として扱ってよい。
 */
export function isBookmarkReviewDue(
  bookmarks: Set<string>,
  views: Record<string, number>,
  now: number
): boolean {
  if (bookmarks.size === 0) return false
  let oldest = Infinity
  for (const key of bookmarks) {
    const last = views[key] ?? 0
    if (last < oldest) oldest = last
  }
  return oldest < now - BM_STALE_MS
}
