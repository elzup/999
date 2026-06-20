import type { NumberEntry, GoroAlloc } from '../data/schema'

export type AllocItem = { key: string; kind: string; count: number }
export type AllocMode = '_YZ' | 'XY_' | 'XY+YZ'
export const ALLOC_MODES: AllocMode[] = ['_YZ', 'XY_', 'XY+YZ']
export type Allocation = Record<AllocMode, Record<string, AllocItem[]>>

export type CellWord = {
  num: string
  word: string
  slot: string
  key: string
  kind: string
}

export type SelectedCell = {
  mode: AllocMode
  vv: string
  key: string
  kind: string
  includeExtras: boolean
}

type SlotDesc = { ga: keyof GoroAlloc; word: keyof NumberEntry; label: string }

const TAIL_SLOTS: SlotDesc[] = [
  { ga: 't1', word: 'w1', label: 'w1' },
  { ga: 't2', word: 'w2', label: 'w2' },
  { ga: 't3', word: 'w1_2', label: '予1' },
  { ga: 't4', word: 'w2_2', label: '予2' },
]
const HEAD_SLOTS: SlotDesc[] = [
  { ga: 'h1', word: 'w1', label: 'w1' },
  { ga: 'h2', word: 'w2', label: 'w2' },
  { ga: 'h3', word: 'w1_2', label: '予1' },
  { ga: 'h4', word: 'w2_2', label: '予2' },
]

type RawDist = Map<string, { count: number; kind: string }>

function cleanWord(w: string): string {
  return w
    .split('#')[0]
    .replace(/\s+-\w+$/g, '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .trim()
}

function renderKind(key: string, kind: string, vv: string): string {
  if (kind !== 'single') return kind
  const chars = [...key]
  if (vv[0] === vv[1] && chars.length === 2 && chars[0] !== chars[1])
    return 'mix'
  return 'single'
}

function bump(dist: RawDist, key: string, kind: string) {
  const cur = dist.get(key) ?? { count: 0, kind }
  cur.count += 1
  dist.set(key, cur)
}

function pickSlots(ga: GoroAlloc | undefined, slots: SlotDesc[]) {
  if (!ga) return []
  return slots
    .map((s) => ga[s.ga] as { k: string; d: string } | null | undefined)
    .filter((g): g is { k: string; d: string } => !!g)
}

function rawBuild(
  numbers: NumberEntry[],
  groupKeyFn: (num: string) => string,
  slots: SlotDesc[]
): Map<string, RawDist> {
  const groups = new Map<string, RawDist>()
  for (const n of numbers) {
    if (!/^\d{3}$/.test(n.num)) continue
    const gk = groupKeyFn(n.num)
    if (!groups.has(gk)) groups.set(gk, new Map())
    const dist = groups.get(gk)!
    const slotGoros = pickSlots(n.ga, slots)
    if (slotGoros.length === 0) {
      bump(dist, '(none)', 'none')
      continue
    }
    for (const g of slotGoros) bump(dist, g.k, g.d)
  }
  return groups
}

function mergeRaw(a?: RawDist, b?: RawDist): RawDist {
  const out: RawDist = new Map()
  for (const src of [a, b]) {
    if (!src) continue
    for (const [k, v] of src) {
      const cur = out.get(k) ?? { count: 0, kind: v.kind }
      cur.count += v.count
      out.set(k, cur)
    }
  }
  return out
}

function toItems(dist: RawDist | undefined, vv: string): AllocItem[] {
  if (!dist) return []
  return [...dist.entries()]
    .map(([key, { count, kind }]) => ({
      key,
      kind: renderKind(key, kind, vv),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

const VALUES = Array.from({ length: 100 }, (_, v) => String(v).padStart(2, '0'))

const tailSlots = (ext: boolean) => (ext ? TAIL_SLOTS : TAIL_SLOTS.slice(0, 2))
const headSlots = (ext: boolean) => (ext ? HEAD_SLOTS : HEAD_SLOTS.slice(0, 2))

/** w1/w2(+予備) を対象に、_YZ / XY_ / XY+YZ の3モード分布を構築する */
export function buildAllocation(
  numbers: NumberEntry[],
  includeExtras = false
): Allocation {
  const tail = rawBuild(numbers, (n) => n.slice(1), tailSlots(includeExtras))
  const head = rawBuild(numbers, (n) => n.slice(0, 2), headSlots(includeExtras))

  const yz: Record<string, AllocItem[]> = {}
  const xy: Record<string, AllocItem[]> = {}
  const both: Record<string, AllocItem[]> = {}
  for (const vv of VALUES) {
    yz[vv] = toItems(tail.get(vv), vv)
    xy[vv] = toItems(head.get(vv), vv)
    both[vv] = toItems(mergeRaw(tail.get(vv), head.get(vv)), vv)
  }
  return { _YZ: yz, XY_: xy, 'XY+YZ': both }
}

function collect(
  numbers: NumberEntry[],
  groupKeyFn: (num: string) => string,
  slots: SlotDesc[],
  vv: string,
  key: string,
  out: CellWord[]
) {
  for (const n of numbers) {
    if (!/^\d{3}$/.test(n.num) || groupKeyFn(n.num) !== vv) continue
    for (const s of slots) {
      const g = n.ga?.[s.ga] as { k: string; d: string } | null | undefined
      if (!g || g.k !== key) continue
      const raw = (n[s.word] as string) || ''
      out.push({
        num: n.num,
        word: cleanWord(raw) || raw,
        slot: s.label,
        key,
        kind: g.d,
      })
    }
  }
}

/** クリックされたセル(mode, vv, key)に該当する語リストを返す */
export function getCellWords(
  numbers: NumberEntry[],
  mode: AllocMode,
  vv: string,
  key: string,
  includeExtras: boolean
): CellWord[] {
  const out: CellWord[] = []
  if (mode === '_YZ' || mode === 'XY+YZ') {
    collect(numbers, (n) => n.slice(1), tailSlots(includeExtras), vv, key, out)
  }
  if (mode === 'XY_' || mode === 'XY+YZ') {
    collect(
      numbers,
      (n) => n.slice(0, 2),
      headSlots(includeExtras),
      vv,
      key,
      out
    )
  }
  return out.sort((a, b) => a.num.localeCompare(b.num))
}
