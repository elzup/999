const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

/** バイト数を単位を切り替えて読める形に (10242.43 MB → 10.0 GB) */
export function formatBytes(bytes: number | null) {
  if (bytes === null) return '-'
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`
  return `${(bytes / GB).toFixed(1)} GB`
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** then が now から見てどれくらい前か (「3 時間前」など)。未来の時刻は «たった今» に寄せる */
export function timeAgo(then: Date, now: Date) {
  const diff = now.getTime() - then.getTime()
  if (diff < MINUTE) return 'たった今'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`
  return `${Math.floor(diff / DAY)} 日前`
}
