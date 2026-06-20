import type { NumberEntry, GoroAlloc } from '../data/schema'

export type AllocItem = { key: string; kind: string; count: number }
export type AllocMode = '_YZ' | 'XY_' | 'XY+YZ'
export const ALLOC_MODES: AllocMode[] = ['_YZ', 'XY_', 'XY+YZ']
export type Allocation = Record<AllocMode, Record<string, AllocItem[]>>

type SlotPick = (ga: GoroAlloc) => Array<{ k: string; d: string } | null>

type RawDist = Map<string, { count: number; kind: string }>

/** single 読みで同じ数字を別かなで表すもの(mix)を判定して種別を確定 */
function renderKind(key: string, kind: string, vv: string): string {
  if (kind !== 'single') return kind
  const chars = [...key]
  if (vv[0] === vv[1] && chars.length === 2 && chars[0] !== chars[1]) {
    return 'mix'
  }
  return 'single'
}

function bump(dist: RawDist, key: string, kind: string) {
  const cur = dist.get(key) ?? { count: 0, kind }
  cur.count += 1
  dist.set(key, cur)
}

function rawBuild(
  numbers: NumberEntry[],
  groupKeyFn: (num: string) => string,
  pick: SlotPick
): Map<string, RawDist> {
  const groups = new Map<string, RawDist>()
  for (const n of numbers) {
    if (!/^\d{3}$/.test(n.num)) continue
    const gk = groupKeyFn(n.num)
    if (!groups.has(gk)) groups.set(gk, new Map())
    const dist = groups.get(gk)!
    const slots = n.ga
      ? pick(n.ga).filter((s): s is { k: string; d: string } => !!s)
      : []
    if (slots.length === 0) {
      bump(dist, '(none)', 'none')
      continue
    }
    for (const s of slots) bump(dist, s.k, s.d)
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

/** w1/w2 両方を対象に、_YZ / XY_ / XY+YZ の3モード分布を構築する */
export function buildAllocation(numbers: NumberEntry[]): Allocation {
  const tail = rawBuild(
    numbers,
    (n) => n.slice(1),
    (ga) => [ga.t1, ga.t2]
  )
  const head = rawBuild(
    numbers,
    (n) => n.slice(0, 2),
    (ga) => [ga.h1, ga.h2]
  )

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
