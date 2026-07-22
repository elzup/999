import { z } from 'zod'
import {
  RecordSchema,
  CardStatsSchema,
  CardTrainSettingsSchema,
} from './schema'
import { VALID_TABS } from './constants'
import type {
  Record as QuizRecord,
  CardStats,
  CardTrainSettings,
} from './schema'
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
export function loadRecords(key: string): QuizRecord[] {
  return loadJson(key, RecordsSchema, [])
}

export function saveRecords(key: string, records: QuizRecord[]) {
  saveJson(key, records)
}

export function loadPiRecords(key = 'pi999'): QuizRecord[] {
  return loadJson(key, RecordsSchema, [])
}

export function savePiRecords(records: QuizRecord[], key = 'pi999') {
  saveJson(key, records)
}

export function loadYearRecords(): QuizRecord[] {
  return loadJson('year999', RecordsSchema, [])
}

export function saveYearRecords(records: QuizRecord[]) {
  saveJson('year999', records)
}

export function loadD3Records(): QuizRecord[] {
  return loadJson('d3-999', RecordsSchema, [])
}

export function saveD3Records(records: QuizRecord[]) {
  saveJson('d3-999', records)
}

export function loadCardRecords(): QuizRecord[] {
  return loadJson('card999', RecordsSchema, [])
}

export function saveCardRecords(records: QuizRecord[]) {
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

export function loadWeekdayRecords(): QuizRecord[] {
  return loadJson('weekday999', RecordsSchema, [])
}

export function saveWeekdayRecords(records: QuizRecord[]) {
  saveJson('weekday999', records)
}

// 九九 AB(=ABxC の AB) ごとの練習スコア。AB キーで best/last を保存する。
export type KukuAbScore = {
  best: number
  last: number
  total: number
  date: string
}

export function loadKukuAbScores(): Record<string, KukuAbScore> {
  try {
    const raw = localStorage.getItem('kukuAbScores999')
    return raw ? (JSON.parse(raw) as Record<string, KukuAbScore>) : {}
  } catch {
    return {}
  }
}

export function saveKukuAbScores(scores: Record<string, KukuAbScore>) {
  localStorage.setItem('kukuAbScores999', JSON.stringify(scores))
}

// スライドショー設定 (モード / 速度 / 絞り込み) を永続化する。
const SlideSettingsSchema = z.object({
  mode: z.enum(['order', 'random']).default('order'),
  speed: z.number().int().min(0).max(2).default(1),
  bmOnly: z.boolean().default(false),
  skipOk: z.boolean().default(false),
})

export type SlideSettings = z.infer<typeof SlideSettingsSchema>

export function loadSlideSettings(): SlideSettings {
  return loadJson('slideSettings999', SlideSettingsSchema, {
    mode: 'order',
    speed: 1,
    bmOnly: false,
    skipOk: false,
  })
}

export function saveSlideSettings(settings: SlideSettings) {
  saveJson('slideSettings999', settings)
}

// App Bar に表示するタブの ON/OFF 設定。
const TabVisibilitySchema = z.record(z.boolean())
export type TabVisibility = Record<TabId, boolean>

export const DEFAULT_TAB_VISIBILITY: TabVisibility = {
  num: true,
  card: true,
  pi: true,
  year: true,
  weekday: false,
  kuku: false,
  slide: false,
  bm: true,
  hex: false,
  misc: true,
}

export function loadTabVisibility(): TabVisibility {
  const loaded = loadJson(
    'tabVisibility999',
    TabVisibilitySchema,
    DEFAULT_TAB_VISIBILITY
  )
  const next = { ...DEFAULT_TAB_VISIBILITY }
  for (const id of VALID_TABS) {
    if (typeof loaded[id] === 'boolean') next[id] = loaded[id]
  }
  return next
}

export function saveTabVisibility(visibility: TabVisibility) {
  saveJson('tabVisibility999', visibility)
}

// スライドショーで「一応OK」印を付けた数字の集合 (bm とは別管理)。
export function loadSlideOk(): Set<string> {
  try {
    const raw = localStorage.getItem('slideOk999')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSlideOk(ok: Set<string>) {
  localStorage.setItem('slideOk999', JSON.stringify([...ok]))
}
