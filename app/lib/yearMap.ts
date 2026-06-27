import type { NumberEntry } from '../data/schema'
import { XY_TO_Z } from '../data/constants'
import { resolveSlot, candidateAt, type Slot } from './choice'

/** グループ番号(0-6) または up / down */
export type GroupKey = string

/** レイアウト上の 1 矩形 (グリッド座標, 1-based) */
export type LayoutCell = {
  /** 生ラベル。`group-order` 形式 (例 "1-2") か、単独セルは "6" のように order 無し */
  label: string
  x: number
  y: number
  w: number
  h: number
  color: string
}

/**
 * 年コード 2次元マップのレイアウト定義。
 * x,y は左上のグリッド座標 (1-based), w/h はマス数。
 * label の `group` 部 (ダッシュ前) が同じ矩形は同一グループの飛び地。
 * `order` 部 (ダッシュ後) が member を詰める順序 (1 始まり)。
 */
export const YEAR_MAP_LAYOUT: LayoutCell[] = [
  { label: '1-1', x: 6, y: 15, w: 5, h: 2, color: '#4ecdc4' },
  { label: '0-2', x: 6, y: 17, w: 5, h: 1, color: '#5b8def' },
  { label: '4-2', x: 7, y: 11, w: 5, h: 1, color: '#fb7185' },
  { label: '5', x: 4, y: 9, w: 4, h: 2, color: '#ea580c' },
  { label: '6', x: 11, y: 14, w: 3, h: 4, color: '#9ca3af' },
  { label: 'up', x: 4, y: 7, w: 6, h: 2, color: '#e5e7eb' },
  { label: 'down', x: 10, y: 7, w: 4, h: 2, color: '#6b7280' },
  { label: '0-1', x: 4, y: 15, w: 2, h: 3, color: '#5b8def' },
  { label: '1-2', x: 4, y: 14, w: 2, h: 1, color: '#4ecdc4' },
  { label: '3-2', x: 7, y: 12, w: 4, h: 1, color: '#e11d48' },
  { label: '2-2', x: 6, y: 13, w: 5, h: 2, color: '#ffbe3d' },
  { label: '4-1', x: 12, y: 11, w: 1, h: 3, color: '#fb7185' },
  { label: '5', x: 10, y: 9, w: 3, h: 2, color: '#ea580c' },
  { label: '4-3', x: 8, y: 9, w: 2, h: 2, color: '#fb7185' },
  { label: '3-1', x: 4, y: 11, w: 3, h: 2, color: '#e11d48' },
  { label: '3-3', x: 11, y: 12, w: 1, h: 2, color: '#e11d48' },
  { label: '2-1', x: 5, y: 13, w: 1, h: 1, color: '#ffbe3d' },
  { label: 'down', x: 13, y: 9, w: 1, h: 1, color: '#6b7280' },
]

/** ラベルを group と order に分解する */
export function parseLabel(label: string): {
  group: GroupKey
  order: number | null
} {
  const dash = label.indexOf('-')
  if (dash < 0) return { group: label, order: null }
  const after = label.slice(dash + 1)
  return {
    group: label.slice(0, dash),
    order: /^\d+$/.test(after) ? Number(after) : null,
  }
}

/** マップ全体のグリッド範囲 (CSS grid の列数・行数算出に使う) */
export function getMapBounds(layout: LayoutCell[] = YEAR_MAP_LAYOUT) {
  const minX = Math.min(...layout.map((c) => c.x))
  const minY = Math.min(...layout.map((c) => c.y))
  const maxX = Math.max(...layout.map((c) => c.x + c.w))
  const maxY = Math.max(...layout.map((c) => c.y + c.h))
  return { minX, minY, cols: maxX - minX, rows: maxY - minY }
}

/** 2桁数字 XY が属するグループを決める。X==Z→up, Y==Z→down, それ以外→Z */
export function classifyXY(xy: string): GroupKey {
  const z = XY_TO_Z[xy]
  if (z === undefined) return ''
  const tens = xy[0]
  const ones = xy[1]
  if (tens === z) return 'up'
  if (ones === z) return 'down'
  return z
}

/** グループごとの member (2桁数字) を昇順で返す */
export function membersByGroup(): Map<GroupKey, string[]> {
  const map = new Map<GroupKey, string[]>()
  for (let n = 0; n < 100; n++) {
    const xy = String(n).padStart(2, '0')
    const g = classifyXY(xy)
    if (!g) continue
    const list = map.get(g) ?? []
    list.push(xy)
    map.set(g, list)
  }
  return map
}

export type MapTile = {
  xy: string
  /** 年コード Z (0-6) */
  z: string
  /** 対応する 3桁 年コード番号 0XY (000-099) */
  num: string
  /** 年マップで採用中のスロット (候補が無ければ null) */
  slot: Slot | null
  img?: string
  word?: string
}

export type RenderedCell = LayoutCell & {
  group: GroupKey
  order: number | null
  /** この矩形に割り当てられた member tile */
  tiles: MapTile[]
}

/** order 指定があればそれ優先、無ければ reading order (上→下, 左→右) */
function cellOrder(a: RenderedCell, b: RenderedCell): number {
  if (a.order != null && b.order != null) return a.order - b.order
  if (a.order != null) return -1
  if (b.order != null) return 1
  return a.y - b.y || a.x - b.x
}

/**
 * 3桁番号からタイルを作る。xy は表示用の下2桁、num は採用候補の解決に使う。
 * 年マップ・数字マップ共通。
 */
export function tileFromNum(
  num: string,
  byNum: Map<string, NumberEntry>,
  overrides: Record<string, Slot>
): MapTile {
  const xy = num.slice(1)
  const z = XY_TO_Z[xy] ?? ''
  const entry = byNum.get(num)
  if (!entry) return { xy, z, num, slot: null }
  const slot = resolveSlot(entry, overrides)
  const cand = candidateAt(entry, slot)
  return { xy, z, num, slot, img: cand?.img, word: cand?.word }
}

/** total 件を k セルへ「均等割」した連続ブロックのサイズ列 */
function evenSplit(total: number, k: number): number[] {
  const sizes: number[] = []
  for (let i = 0; i < k; i++) {
    sizes.push(Math.floor(((i + 1) * total) / k) - Math.floor((i * total) / k))
  }
  return sizes
}

/**
 * 均等割を基本としつつ各セルの容量 (w*h) を超えない件数配分を返す。
 * 超過分は order の早いセルの空き容量へ前詰めで回す。
 */
function distribute(total: number, caps: number[]): number[] {
  const sizes = evenSplit(total, caps.length)
  let overflow = 0
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] > caps[i]) {
      overflow += sizes[i] - caps[i]
      sizes[i] = caps[i]
    }
  }
  for (let i = 0; i < sizes.length && overflow > 0; i++) {
    const spare = caps[i] - sizes[i]
    const add = Math.min(spare, overflow)
    sizes[i] += add
    overflow -= add
  }
  // 総容量不足: データを落とさず最後のセルに溢れ分を載せる (はみ出し表示)
  if (overflow > 0) sizes[sizes.length - 1] += overflow
  return sizes
}

/**
 * レイアウト各矩形に tile を割り当てる汎用ロジック。
 * 同一グループ (label のダッシュ前) 内では order 順に、均等割 (容量考慮) で
 * 連続して詰める。getTiles(group) がそのグループの tile 列を順序付きで返す。
 */
export function assignToLayout(
  layout: LayoutCell[],
  getTiles: (group: GroupKey) => MapTile[]
): RenderedCell[] {
  const cells: RenderedCell[] = layout.map((c) => {
    const { group, order } = parseLabel(c.label)
    return { ...c, group, order, tiles: [] }
  })

  const groups = new Set(cells.map((c) => c.group))
  for (const g of groups) {
    const groupCells = cells.filter((c) => c.group === g).sort(cellOrder)
    const list = getTiles(g)
    const sizes = distribute(
      list.length,
      groupCells.map((c) => c.w * c.h)
    )
    let cursor = 0
    groupCells.forEach((cell, i) => {
      cell.tiles = list.slice(cursor, cursor + sizes[i])
      cursor += sizes[i]
    })
  }

  return cells
}

/** 年コード 2次元マップ (000-099, 末尾グループ + up/down) を組む */
export function buildYearMap(
  numbers: NumberEntry[],
  overrides: Record<string, Slot> = {},
  layout: LayoutCell[] = YEAR_MAP_LAYOUT
): RenderedCell[] {
  const byNum = new Map(numbers.map((n) => [n.num, n]))
  const members = membersByGroup()
  return assignToLayout(layout, (g) =>
    (members.get(g) ?? []).map((xy) => tileFromNum('0' + xy, byNum, overrides))
  )
}
