// 日付キーの規則 (date タブ用)。app/lib/dateKeys.ts と同じ規則。
//
// キー = 月 (ゼロ埋めなし) + 日 (2桁ゼロ埋め)。1/1 → "101", 12/31 → "1231"。
// 1〜9月は 3 桁になり num 辞書 (000-999) をそのまま使う。
// 10〜12月だけが 4 桁 (1001-1231) で、シートに独自の行を持つ。
// 2/29 は含めない (365 日分)。

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function dateKey(month, day) {
  return `${month}${String(day).padStart(2, '0')}`
}

export function allDateKeys() {
  const keys = []
  DAYS_IN_MONTH.forEach((days, i) => {
    for (let d = 1; d <= days; d++) keys.push(dateKey(i + 1, d))
  })
  return keys
}

const DATE_KEY4_SET = new Set(allDateKeys().filter((k) => k.length === 4))

/** 4 桁の日付キー (1001-1231 の実在日) か */
export function isDateKey4(num) {
  return DATE_KEY4_SET.has(num)
}
