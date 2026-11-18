// 代表の進み具合の統計。番号 XYZ (百・十・一の位) を 2 桁ずつ取り出して 10×10 に数える。
//   xy: 行 = 百の位、列 = 十の位 (1 セル = 一の位の 10 番号)
//   yz: 行 = 十の位、列 = 一の位 (1 セル = 百の位の 10 番号)
// 段階は repLevel と同じ (0 = 未確定 / 1 = ① だけ / 2 = ①② まで)。
import type { NumberDoc } from './numberApi'
import { repLevel } from './repPicker'

export type Axis = 'xy' | 'yz'
/** 段階ごとの番号の数 [未確定, ① だけ, ①②] */
export type LevelCounts = [number, number, number]

export type RepMatrix = {
  /** cells[行][列] */
  cells: LevelCounts[][]
  /** 行ごとの合計 */
  rows: LevelCounts[]
  /** 列ごとの合計 */
  cols: LevelCounts[]
  total: LevelCounts
}

const zero = (): LevelCounts => [0, 0, 0]
const AXIS_DIGITS: Record<Axis, [number, number]> = { xy: [0, 1], yz: [1, 2] }

export function repMatrix(docs: NumberDoc[], axis: Axis): RepMatrix {
  const cells = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, zero)
  )
  const rows = Array.from({ length: 10 }, zero)
  const cols = Array.from({ length: 10 }, zero)
  const total = zero()
  const [ri, ci] = AXIS_DIGITS[axis]
  for (const doc of docs) {
    if (!/^\d{3}$/.test(doc.num)) continue
    const r = Number(doc.num[ri])
    const c = Number(doc.num[ci])
    const level = repLevel(doc)
    cells[r][c][level] += 1
    rows[r][level] += 1
    cols[c][level] += 1
    total[level] += 1
  }
  return { cells, rows, cols, total }
}

/** 代表を決めた番号の数 (① だけ + ①②) */
export const setCount = (counts: LevelCounts) => counts[1] + counts[2]

/** 数えた番号の数 */
export const allCount = (counts: LevelCounts) =>
  counts[0] + counts[1] + counts[2]
