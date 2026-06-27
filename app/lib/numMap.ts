import type { NumberEntry } from '../data/schema'
import {
  assignToLayout,
  tileFromNum,
  getMapBounds,
  type LayoutCell,
  type RenderedCell,
} from './yearMap'
import type { Slot } from './choice'

/** X00 系マップ: 各百の位を 10 枚のマップで扱う (0..9)。 */
export const HUNDREDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/**
 * 百の位ごとのレイアウト。group ラベルは tens base (例 "110")。
 * 各 tens グループは下1桁 0-9 の 10 個を持つ。未設計の百は未定義。
 */
export const HUNDRED_LAYOUTS: Record<number, LayoutCell[]> = {
  1: [
    { label: '110-', x: 10, y: 15, w: 5, h: 2, color: '#4ecdc4' },
    { label: '120-', x: 6, y: 13, w: 3, h: 4, color: '#ffbe3d' },
    { label: '100-', x: 6, y: 17, w: 5, h: 2, color: '#5b8def' },
    { label: '130-', x: 9, y: 13, w: 5, h: 2, color: '#ea580c' },
    { label: '140-', x: 6, y: 11, w: 5, h: 2, color: '#f97316' },
    { label: '150-', x: 11, y: 11, w: 5, h: 2, color: '#f59e0b' },
    { label: '170-', x: 8, y: 9, w: 5, h: 2, color: '#d97706' },
    { label: '180', x: 7, y: 7, w: 5, h: 2, color: '#eab308' },
    { label: '190', x: 11, y: 5, w: 5, h: 2, color: '#facc15' },
    { label: '160', x: 13, y: 7, w: 3, h: 4, color: '#16a34a' },
  ],
}

export function hasHundredLayout(hundred: number): boolean {
  return HUNDRED_LAYOUTS[hundred] !== undefined
}

/** tens base (3桁, 末尾0) からその 10 個の 3桁番号を昇順で返す */
function tensMembers(base: string): string[] {
  const n = Number(base)
  return Array.from({ length: 10 }, (_, i) => String(n + i).padStart(3, '0'))
}

export function getNumMapBounds(hundred: number) {
  const layout = HUNDRED_LAYOUTS[hundred]
  return layout ? getMapBounds(layout) : null
}

/** X00 マップ (tens グループ) を組む。未設計の百は null。 */
export function buildNumMap(
  numbers: NumberEntry[],
  hundred: number,
  overrides: Record<string, Slot> = {}
): RenderedCell[] | null {
  const layout = HUNDRED_LAYOUTS[hundred]
  if (!layout) return null
  const byNum = new Map(numbers.map((n) => [n.num, n]))
  return assignToLayout(layout, (base) =>
    tensMembers(base).map((num) => tileFromNum(num, byNum, overrides))
  )
}
