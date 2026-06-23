import type { NumberEntry } from '../data/schema'
import picksJson from '../data/ymapPicks.json'

/** 年マップが採用しうる候補スロット */
export const SLOTS = ['w1', 'w2', 'w1_2', 'w2_2'] as const
export type Slot = (typeof SLOTS)[number]

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
  Slot,
  { word: keyof NumberEntry; kana?: keyof NumberEntry; img: keyof NumberEntry }
> = {
  w1: { word: 'w1', kana: 'w1k', img: 'w1Img' },
  w2: { word: 'w2', kana: 'w2k', img: 'w2Img' },
  w1_2: { word: 'w1_2', img: 'w1_2Img' },
  w2_2: { word: 'w2_2', img: 'w2_2Img' },
}

/** entry が実際に持つ (語句が空でない) 候補だけを返す */
export function candidatesOf(entry: NumberEntry): Candidate[] {
  const out: Candidate[] = []
  for (const slot of SLOTS) {
    const f = SLOT_FIELDS[slot]
    const word = (entry[f.word] as string | undefined) ?? ''
    if (!word) continue
    out.push({
      slot,
      word,
      kana: f.kana ? ((entry[f.kana] as string | undefined) ?? '') : '',
      img: entry[f.img] as string | undefined,
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
  const has = (s?: string): s is Slot => cands.some((c) => c.slot === s)
  const ov = overrides[entry.num]
  if (has(ov)) return ov
  const def = YMAP_PICKS[entry.num]
  if (has(def)) return def
  return cands[0].slot
}

export function candidateAt(
  entry: NumberEntry,
  slot: Slot | null
): Candidate | null {
  if (!slot) return null
  return candidatesOf(entry).find((c) => c.slot === slot) ?? null
}

// --- localStorage (年マップ専用の選択) ---
const KEY = 'ymapchoice999'

export function loadYmapChoices(): Record<string, Slot> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
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
      acc[k] = merged[k]
      return acc
    }, {})
  return JSON.stringify(sorted, null, 2)
}
