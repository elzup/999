import type { NumberEntry } from '../data/schema'

// 日付キーの規則。src/date-keys.js と同じ規則。
//
// キー = 月 (ゼロ埋めなし) + 日 (2桁ゼロ埋め)。1/1 → "101", 12/31 → "1231"。
// 1〜9月は 3 桁で num 辞書をそのまま引き、10〜12月だけ 4 桁の dates 辞書を引く。
// 2/29 は含めない (365 日分)。

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export type DateDay = { month: number; day: number; key: string }

export function dateKey(month: number, day: number): string {
  return `${month}${String(day).padStart(2, '0')}`
}

export function allDateDays(): DateDay[] {
  return DAYS_IN_MONTH.flatMap((days, i) =>
    Array.from({ length: days }, (_, j) => ({
      month: i + 1,
      day: j + 1,
      key: dateKey(i + 1, j + 1),
    }))
  )
}

function emptyEntry(num: string): NumberEntry {
  return {
    num,
    w1: '',
    w1k: '',
    w2: '',
    w2k: '',
    hito: '',
    mono: '',
    gainen: '',
    catScore: null,
    w1Score: null,
    w2Score: null,
  }
}

/** 365 日分のエントリ。辞書に無い日は空エントリで埋める (num = 日付キー) */
export function buildDateEntries(
  numbers: NumberEntry[],
  dates: NumberEntry[] = []
): (DateDay & { entry: NumberEntry })[] {
  const byNum = new Map<string, NumberEntry>()
  for (const d of numbers) byNum.set(d.num, d)
  for (const d of dates) byNum.set(d.num, d)
  return allDateDays().map((dd) => ({
    ...dd,
    entry: byNum.get(dd.key) ?? emptyEntry(dd.key),
  }))
}
