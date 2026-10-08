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

// 辞書本体 (/api/app/data) の SWR キャッシュ。次回起動を即表示にするための
// 生 JSON 文字列 (~1MB) を丸ごと保持する。鮮度は起動時の再取得で担保し、
// 壊れていたら呼び出し側が捨ててネットワーク取得に倒す
const APP_DATA_CACHE_KEY = 'appDataCache999'

export function loadAppDataCache(): string | null {
  try {
    return localStorage.getItem(APP_DATA_CACHE_KEY)
  } catch {
    return null
  }
}

export function saveAppDataCache(text: string) {
  try {
    localStorage.setItem(APP_DATA_CACHE_KEY, text)
  } catch {
    // quota (5MB) 超過など。キャッシュは起動高速化のためだけなので、
    // 保存できなくても動作には影響しない
  }
}

export function clearAppDataCache() {
  localStorage.removeItem(APP_DATA_CACHE_KEY)
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

// スライドショー設定 (モード / 待ち時間 / 絞り込み) を永続化する。全デッキ共通。
// 旧形式 (speed: 0-2) は読み捨てて待ち時間を既定値に戻す。
const DEFAULT_PROMPT_MS = 2000
const DEFAULT_ANSWER_MS = 3500
const SlideSettingsSchema = z.object({
  mode: z.enum(['order', 'random']).default('order'),
  promptMs: z.number().min(0).default(DEFAULT_PROMPT_MS),
  answerMs: z.number().positive().default(DEFAULT_ANSWER_MS),
  bmOnly: z.boolean().default(false),
  skipOk: z.boolean().default(false),
})

export type SlideSettings = z.infer<typeof SlideSettingsSchema>

export function loadSlideSettings(): SlideSettings {
  return loadJson('slideSettings999', SlideSettingsSchema, {
    mode: 'order',
    promptMs: DEFAULT_PROMPT_MS,
    answerMs: DEFAULT_ANSWER_MS,
    bmOnly: false,
    skipOk: false,
  })
}

export function saveSlideSettings(settings: SlideSettings) {
  saveJson('slideSettings999', settings)
}

// App Bar に表示するタブの ON/OFF 設定。
const TabVisibilitySchema = z.record(z.string(), z.unknown())
export type TabVisibility = Record<TabId, boolean>

export const DEFAULT_TAB_VISIBILITY: TabVisibility = {
  num: true,
  date: true,
  card: true,
  pi: true,
  year: true,
  weekday: false,
  kuku: false,
  slide: false,
  bm: true,
  hex: false,
  edit: false,
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
    if (id !== 'misc' && typeof loaded[id] === 'boolean') next[id] = loaded[id]
  }
  return next
}

export function saveTabVisibility(visibility: TabVisibility) {
  saveJson('tabVisibility999', visibility)
}

// スライドショーで「一応OK」印を付けたアイテムの集合 (bm とは別管理)。デッキごとに持つ。
// 数字デッキだけは分割前のキーをそのまま使い、付けた印を引き継ぐ。
const SLIDE_OK_LEGACY_DECK = 'num'
const slideOkKey = (deckId: string) =>
  deckId === SLIDE_OK_LEGACY_DECK ? 'slideOk999' : `slideOk999.${deckId}`

export function loadSlideOk(deckId: string): Set<string> {
  try {
    const raw = localStorage.getItem(slideOkKey(deckId))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveSlideOk(deckId: string, ok: Set<string>) {
  localStorage.setItem(slideOkKey(deckId), JSON.stringify([...ok]))
}
