import { z } from 'zod'
import {
  RecordSchema,
  CardStatsSchema,
  CardTrainSettingsSchema,
} from './schema'
import { VALID_TABS } from './constants'
import type { Record, CardStats, CardTrainSettings } from './schema'
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

// ブックマーク復習リマインド: 各ブックマークを最後に詳細表示した時刻(ms)を記録する。
// 全ブックマーク中で最も長く開かれていないものがこの閾値を超えたら Tab Bar を光らせる。
export const BM_STALE_MS = 7 * 24 * 60 * 60 * 1000 // 1週間

export function loadBookmarkViews(): Record<string, number> {
  try {
    const raw = localStorage.getItem('bmViews999')
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function saveBookmarkViews(views: Record<string, number>) {
  localStorage.setItem('bmViews999', JSON.stringify(views))
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

// Sub-tab (親タブごとの選択状態を記憶する)
export function loadSubTab<T extends string>(
  key: string,
  valid: readonly T[],
  fallback: T
): T {
  const saved = localStorage.getItem(key)
  return (valid as readonly string[]).includes(saved ?? '')
    ? (saved as T)
    : fallback
}

export function saveSubTab(key: string, value: string) {
  localStorage.setItem(key, value)
}

// Records
const RecordsSchema = z.array(RecordSchema)

/** 任意キーのテスト記録を読み書きする汎用ヘルパ(useQuizRecords が使用) */
export function loadRecords(key: string): Record[] {
  return loadJson(key, RecordsSchema, [])
}

export function saveRecords(key: string, records: Record[]) {
  saveJson(key, records)
}

export function loadPiRecords(key = 'pi999'): Record[] {
  return loadJson(key, RecordsSchema, [])
}

export function savePiRecords(records: Record[], key = 'pi999') {
  saveJson(key, records)
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

export function loadCardStats(): CardStats {
  return loadJson('cardStats999', CardStatsSchema, {})
}

export function saveCardStats(stats: CardStats) {
  saveJson('cardStats999', stats)
}

export function loadCardTrainSettings(): CardTrainSettings {
  return loadJson('cardTrainSettings999', CardTrainSettingsSchema, {
    groupSize: 2,
    direction: 'right',
  })
}

export function saveCardTrainSettings(settings: CardTrainSettings) {
  saveJson('cardTrainSettings999', settings)
}

export function loadWeekdayRecords(): Record[] {
  return loadJson('weekday999', RecordsSchema, [])
}

export function saveWeekdayRecords(records: Record[]) {
  saveJson('weekday999', records)
}
