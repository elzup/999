// 保存した番号を、読み込み済みの辞書データに差し替える。
// 辞書データは deploy のときの写しなので、差し替えないと一覧・詳細・テストが次の起動まで古い語のまま出る
import { NumberEntrySchema } from '../data/schema'
import type { AppData, NumberEntry } from '../data/schema'

/** サーバの応答を 1 件として読む。形が合わなければ null (差し替えない) */
export function parseNumberEntry(raw: unknown): NumberEntry | null {
  const result = NumberEntrySchema.safeParse(raw)
  return result.success ? result.data : null
}

/** 同じ番号の 1 件を差し替えた辞書データを返す。無い番号・同じ中身なら元のまま */
export function withNumberEntry(data: AppData, entry: NumberEntry): AppData {
  const at = data.numbers.findIndex((item) => item.num === entry.num)
  if (at < 0) return data
  if (JSON.stringify(data.numbers[at]) === JSON.stringify(entry)) return data
  const numbers = [...data.numbers]
  numbers[at] = entry
  return { ...data, numbers }
}
