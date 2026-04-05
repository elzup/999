import { z } from 'zod'
import { RecordSchema } from './schema'
import { VALID_TABS } from './constants'
import type { Record } from './schema'
import type { TabId } from './constants'

function loadJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return schema.parse(JSON.parse(raw))
  } catch {
    return fallback
  }
}

function saveJson(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

// Bookmarks
export function loadBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem('bm999')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveBookmarks(bm: Set<string>) {
  localStorage.setItem('bm999', JSON.stringify([...bm]))
}

// Tab
export function loadTab(): TabId {
  const saved = localStorage.getItem('tab999')
  return (VALID_TABS as readonly string[]).includes(saved ?? '')
    ? (saved as TabId)
    : 'num'
}

export function saveTab(tab: TabId) {
  localStorage.setItem('tab999', tab)
}

// Records
const RecordsSchema = z.array(RecordSchema)

export function loadPiRecords(): Record[] {
  return loadJson('pi999', RecordsSchema, [])
}

export function savePiRecords(records: Record[]) {
  saveJson('pi999', records)
}

export function loadYearRecords(): Record[] {
  return loadJson('year999', RecordsSchema, [])
}

export function saveYearRecords(records: Record[]) {
  saveJson('year999', records)
}

export function loadD3Records(): Record[] {
  return loadJson('d3-999', RecordsSchema, [])
}

export function saveD3Records(records: Record[]) {
  saveJson('d3-999', records)
}

export function loadCardRecords(): Record[] {
  return loadJson('card999', RecordsSchema, [])
}

export function saveCardRecords(records: Record[]) {
  saveJson('card999', records)
}
