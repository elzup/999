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

/** mark 文字列 (♠️A, ♥️10 等) → { suit, rank } */
const MARK_SUIT: Record<string, 'S' | 'H' | 'C' | 'D'> = {
  '♠️': 'S',
  '♠': 'S',
  '♥️': 'H',
  '♥': 'H',
  '♣️': 'C',
  '♣': 'C',
  '♦️': 'D',
  '♦': 'D',
}

function parseMark(mark: string): { suit: string; rank: string } | null {
  for (const [sym, suit] of Object.entries(MARK_SUIT)) {
    if (mark.startsWith(sym)) {
      return { suit, rank: mark.slice(sym.length) }
    }
  }
  return null
}

/** cards.tsv → CardEntry[] (Zod バリデーション付き) */
export function parseCardsTsv(tsv: string) {
  const { headers, rows } = parseTsvRows(tsv)
  const idx = headerIndex(headers)

  const col = (row: string[], name: string) => row[idx.get(name) ?? -1] ?? ''

  return rows
    .map((row) => {
      const mark = col(row, 'mark')
      const parsed = parseMark(mark)
      if (!parsed) {
        console.warn(`Skip invalid card mark: ${mark}`)
        return null
      }
      const raw = {
        suit: parsed.suit,
        rank: parsed.rank,
        first: col(row, 'B') || col(row, 'I') || col(row, 'first'),
        score: parseScore(col(row, 'C') || col(row, 'score')),
        secondary: col(row, 'D') || col(row, 'U') || col(row, 'secondary'),
      }
      const result = CardEntrySchema.safeParse(raw)
      if (!result.success) {
        console.warn(`Skip invalid card entry: ${mark}`, result.error.issues)
        return null
      }
      return result.data
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
}

function parseScore(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(3, value))
}

/** data.json をバリデーション */
export function validateAppData(raw: unknown): AppData {
  return AppDataSchema.parse(raw)
}
