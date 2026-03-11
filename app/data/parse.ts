import { z } from 'zod'
import { NumberEntrySchema, CardEntrySchema, AppDataSchema } from './schema'
import type { AppData } from './schema'

/** TSV 文字列 → ヘッダー + 行の配列 */
function parseTsvRows(tsv: string): { headers: string[]; rows: string[][] } {
  const lines = tsv.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('Empty TSV')
  const headers = lines[0].split('\t').map((h) => h.trim())
  const rows = lines.slice(1).map((l) => l.split('\t').map((c) => c.trim()))
  return { headers, rows }
}

/** ヘッダー名 → インデックスのマップ */
function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>()
  headers.forEach((h, i) => {
    if (!map.has(h)) map.set(h, i)
  })
  return map
}

/** words.tsv → NumberEntry[] (Zod バリデーション付き) */
export function parseWordsTsv(tsv: string) {
  const { headers, rows } = parseTsvRows(tsv)
  const idx = headerIndex(headers)

  const col = (row: string[], name: string) => row[idx.get(name) ?? -1] ?? ''

  return rows
    .map((row) => {
      const raw = {
        num: col(row, 'num'),
        w1: col(row, 'w1'),
        w1k: col(row, 'w1k'),
        w2: col(row, 'w2'),
        w2k: col(row, 'w2k'),
        hito: col(row, 'hito'),
        mono: col(row, 'mono'),
        gainen: col(row, 'gainen'),
      }
      const result = NumberEntrySchema.safeParse(raw)
      if (!result.success) {
        console.warn(`Skip invalid number entry: ${raw.num}`, result.error.issues)
        return null
      }
      return result.data
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
}

/** cards.tsv → CardEntry[] (Zod バリデーション付き) */
export function parseCardsTsv(tsv: string) {
  const { headers, rows } = parseTsvRows(tsv)
  const idx = headerIndex(headers)

  const col = (row: string[], name: string) => row[idx.get(name) ?? -1] ?? ''

  return rows
    .map((row) => {
      const raw = {
        suit: col(row, 'suit'),
        rank: col(row, 'rank'),
        hito: col(row, 'hito'),
        hitoYomi: col(row, 'hitoYomi'),
        dousa: col(row, 'dousa'),
        dousaYomi: col(row, 'dousaYomi'),
        mono: col(row, 'mono'),
        monoYomi: col(row, 'monoYomi'),
      }
      const result = CardEntrySchema.safeParse(raw)
      if (!result.success) {
        console.warn(`Skip invalid card entry: ${raw.suit}${raw.rank}`, result.error.issues)
        return null
      }
      return result.data
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
}

/** data.json をバリデーション */
export function validateAppData(raw: unknown): AppData {
  return AppDataSchema.parse(raw)
}
