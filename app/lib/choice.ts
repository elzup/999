import type { NumberEntry } from '../data/schema'
import picksJson from '../data/ymapPicks.json'

const LEGACY_SLOT_MAP = {
  w1: 'wh1',
  w1_2: 'wh2',
  w2: 'wm1',
  w2_2: 'wm2',
} as const

type CanonicalSlot = 'wh1' | 'wh2' | 'wh3' | 'wm1' | 'wm2' | 'wm3'

type LegacySlot = keyof typeof LEGACY_SLOT_MAP

/** 年マップが採用しうる候補スロット */
export const SLOTS = ['wh1', 'wm1', 'wh2', 'wm2', 'wh3', 'wm3'] as const
export type Slot = CanonicalSlot | LegacySlot

export function normalizeSlot(slot?: string | null): CanonicalSlot | null {
  if (!slot) return null
  if ((SLOTS as readonly string[]).includes(slot)) return slot as CanonicalSlot
  return (LEGACY_SLOT_MAP as Record<string, CanonicalSlot>)[slot] ?? null
}

/**
 * リポジトリにコミットされた既定の採用スロット (num -> slot)。
 * これが「全端末の既定値」。各端末の一時上書きは localStorage が担う。
 * 永続化したいときは export して ymapPicks.json に貼り commit する。
 */
export const YMAP_PICKS: Record<string, Slot> = picksJson as Record<
  string,
  Slot
>

export type Candidate = {
  slot: Slot
  word: string
  kana: string
  img?: string
}

const SLOT_FIELDS: Record<
  CanonicalSlot,
  { word: keyof NumberEntry; kana?: keyof NumberEntry; img: keyof NumberEntry }
> = {
  wh1: { word: 'wh1', kana: 'wh1k', img: 'wh1Img' },
  wm1: { word: 'wm1', kana: 'wm1k', img: 'wm1Img' },
  wh2: { word: 'wh2', kana: 'wh2k', img: 'wh2Img' },
  wm2: { word: 'wm2', kana: 'wm2k', img: 'wm2Img' },
  wh3: { word: 'wh3', kana: 'wh3k', img: 'wh3Img' },
  wm3: { word: 'wm3', kana: 'wm3k', img: 'wm3Img' },
}

/** entry が実際に持つ (語句が空でない) 候補だけを返す */
export function candidatesOf(entry: NumberEntry): Candidate[] {
  const out: Candidate[] = []
  for (const slot of SLOTS) {
    const canonical = normalizeSlot(slot)
    if (!canonical) continue
    const f = SLOT_FIELDS[canonical]
    const word = slotText(entry, f.word, canonical, 'word')
    if (!word) continue
    out.push({
      slot: canonical,
      word,
      kana: f.kana ? slotText(entry, f.kana, canonical, 'kana') : '',
      img: slotText(entry, f.img, canonical, 'img') || undefined,
    })
  }
  return out
}

/**
 * 年マップで採用するスロットを決める。
 * 優先順位: localStorage override > リポジトリ既定 (ymapPicks.json) > 最初の候補。
 */
export function resolveSlot(
  entry: NumberEntry,
  overrides: Record<string, Slot>
): Slot | null {
  const cands = candidatesOf(entry)
  if (cands.length === 0) return null
  const has = (s?: string | null): s is Slot =>
    !!s && cands.some((c) => c.slot === normalizeSlot(s))
  const ov = normalizeSlot(overrides[entry.num])
  if (has(ov)) return ov
  const def = normalizeSlot(YMAP_PICKS[entry.num])
  if (has(def)) return def
  return cands[0].slot
}

export function candidateAt(
  entry: NumberEntry,
  slot: Slot | null
): Candidate | null {
  if (!slot) return null
  const canonical = normalizeSlot(slot)
  if (!canonical) return null
  return candidatesOf(entry).find((c) => c.slot === canonical) ?? null
}

// --- localStorage (年マップ専用の選択) ---
const KEY = 'ymapchoice999'

export function loadYmapChoices(): Record<string, Slot> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return {}
    return Object.fromEntries(
      Object.entries(obj).map(([num, slot]) => [
        num,
        normalizeSlot(slot) ?? slot,
      ])
    ) as Record<string, Slot>
  } catch {
    return {}
  }
}

export function saveYmapChoices(choices: Record<string, Slot>) {
  localStorage.setItem(KEY, JSON.stringify(choices))
}

/**
 * export 用 JSON 文字列。リポジトリ既定に localStorage の上書きを重ねた
 * 「現在の完全な状態」を num 昇順で出力する。これを ymapPicks.json に貼り commit。
 */
export function exportYmapChoices(local: Record<string, Slot>): string {
  const merged = { ...YMAP_PICKS, ...local }
  const sorted = Object.keys(merged)
    .sort()
    .reduce<Record<string, Slot>>((acc, k) => {
      acc[k] = normalizeSlot(merged[k]) ?? merged[k]
      return acc
    }, {})
  return JSON.stringify(sorted, null, 2)
}

function slotText(
  entry: NumberEntry,
  field: keyof NumberEntry,
  slot: CanonicalSlot,
  kind: 'word' | 'kana' | 'img'
) {
  const value = String(entry[field] || '').trim()
  if (value) return value
  if (slot === 'wh1' && kind === 'word') return String(entry.w1 || '').trim()
  if (slot === 'wh1' && kind === 'kana') return String(entry.w1k || '').trim()
  if (slot === 'wh1' && kind === 'img') return String(entry.w1Img || '').trim()
  if (slot === 'wh2' && kind === 'word') return String(entry.w1_2 || '').trim()
  if (slot === 'wh2' && kind === 'img')
    return String(entry.w1_2Img || '').trim()
  if (slot === 'wm1' && kind === 'word') return String(entry.w2 || '').trim()
  if (slot === 'wm1' && kind === 'kana') return String(entry.w2k || '').trim()
  if (slot === 'wm1' && kind === 'img') return String(entry.w2Img || '').trim()
  if (slot === 'wm2' && kind === 'word') return String(entry.w2_2 || '').trim()
  if (slot === 'wm2' && kind === 'img')
    return String(entry.w2_2Img || '').trim()
  return ''
}
