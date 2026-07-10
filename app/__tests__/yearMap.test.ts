import { describe, it, expect } from 'vitest'
import {
  classifyXY,
  membersByGroup,
  buildYearMap,
  getMapBounds,
  buildUnits,
  YEAR_MAP_LAYOUT,
  type LayoutCell,
  type RenderedCell,
} from '../lib/yearMap'
import { XY_TO_Z } from '../data/constants'
import type { NumberEntry } from '../data/schema'

describe('classifyXY', () => {
  it('X(十の位)==Z は up', () => {
    // 06 → Z=0, X=0 → up
    expect(XY_TO_Z['06']).toBe('0')
    expect(classifyXY('06')).toBe('up')
  })

  it('Y(一の位)==Z は down', () => {
    // 01 → Z=1, Y=1 → down
    expect(XY_TO_Z['01']).toBe('1')
    expect(classifyXY('01')).toBe('down')
  })

  it('X も Y も Z でなければグループ番号 Z', () => {
    // 17 → Z=0, X=1,Y=7 → '0'
    expect(XY_TO_Z['17']).toBe('0')
    expect(classifyXY('17')).toBe('0')
  })

  it('X==Z と Y==Z が両立する場合は up を優先', () => {
    // 00 → Z=0, X=0 かつ Y=0 → up
    expect(classifyXY('00')).toBe('up')
  })
})

describe('membersByGroup', () => {
  it('00-99 の全 100 件を漏れなく分類する', () => {
    const map = membersByGroup()
    const total = [...map.values()].reduce((s, l) => s + l.length, 0)
    expect(total).toBe(100)
  })

  it('各 2桁数字は 1 グループにのみ属する (重複なし)', () => {
    const map = membersByGroup()
    const seen = new Set<string>()
    for (const list of map.values()) {
      for (const xy of list) {
        expect(seen.has(xy)).toBe(false)
        seen.add(xy)
      }
    }
    expect(seen.size).toBe(100)
  })
})

const num = (n: string): NumberEntry => ({
  num: n,
  w1: '',
  w1k: '',
  w2: '',
  w2k: '',
  hito: '',
  mono: '',
  gainen: '',
  catScore: null,
  w1Score: null,
  w2Score: null,
})

describe('buildYearMap', () => {
  it('全 member を漏れなく配置する (合計 100 件・容量不足でも欠落しない)', () => {
    const cells = buildYearMap([])
    const total = cells.reduce((s, c) => s + c.tiles.length, 0)
    expect(total).toBe(100)
  })

  it('同一グループの矩形へ重複なく分配する', () => {
    const cells = buildYearMap([])
    const seen = new Set<string>()
    for (const c of cells) {
      for (const t of c.tiles) {
        expect(seen.has(t.xy)).toBe(false)
        seen.add(t.xy)
      }
    }
  })

  it('対応する 3桁 年コード番号 0XY (000-099) の画像を tile に紐付ける', () => {
    // 17 → 年コード番号 017
    const cells = buildYearMap([{ ...num('017'), w1Img: 'img017', w1: 'ヒナ' }])
    const tile = cells.flatMap((c) => c.tiles).find((t) => t.xy === '17')
    expect(tile?.num).toBe('017')
    expect(tile?.img).toBe('img017')
  })
})

describe('getMapBounds', () => {
  it('レイアウトの全矩形を覆うグリッド範囲を返す', () => {
    const b = getMapBounds()
    expect(b.cols).toBeGreaterThan(0)
    expect(b.rows).toBeGreaterThan(0)
    for (const c of YEAR_MAP_LAYOUT) {
      expect(c.x - b.minX + 1 + c.w - 1).toBeLessThanOrEqual(b.cols + 1)
      expect(c.y - b.minY + 1 + c.h - 1).toBeLessThanOrEqual(b.rows + 1)
    }
  })
})

function cell(c: LayoutCell, group?: string): RenderedCell {
  const dash = c.label.indexOf('-')
  const g = group ?? (dash < 0 ? c.label : c.label.slice(0, dash))
  return { ...c, group: g, order: null, tiles: [] }
}

describe('buildUnits', () => {
  it('同じ group の隣接マスでは共有辺のボーダーが消える', () => {
    const cells: RenderedCell[] = [
      cell({ label: 'a-1', x: 1, y: 1, w: 2, h: 1, color: '#000' }),
      cell({ label: 'a-2', x: 3, y: 1, w: 1, h: 1, color: '#000' }),
    ]
    const units = buildUnits(cells)
    const rightEdge = units.find((u) => u.gx === 2 && u.gy === 1)!
    const leftEdge = units.find((u) => u.gx === 3 && u.gy === 1)!
    expect(rightEdge.borders.right).toBe(false)
    expect(leftEdge.borders.left).toBe(false)
  })

  it('異なる group との境界にはボーダーを描く', () => {
    const cells: RenderedCell[] = [
      cell({ label: 'a', x: 1, y: 1, w: 2, h: 1, color: '#000' }),
      cell({ label: 'b', x: 1, y: 2, w: 2, h: 1, color: '#fff' }),
    ]
    const units = buildUnits(cells)
    const aBottom = units.find((u) => u.gx === 1 && u.gy === 1)!
    const bTop = units.find((u) => u.gx === 1 && u.gy === 2)!
    expect(aBottom.borders.bottom).toBe(true)
    expect(bTop.borders.top).toBe(true)
  })

  it('凸凹した和集合でも輪郭が正しく制御される', () => {
    // L 字型 union: a の 2x2 から右下が欠けた形状
    const cells: RenderedCell[] = [
      cell({ label: 'a-1', x: 1, y: 1, w: 2, h: 1, color: '#000' }),
      cell({ label: 'a-2', x: 1, y: 2, w: 1, h: 1, color: '#000' }),
    ]
    const units = buildUnits(cells)
    const aTopLeft = units.find((u) => u.gx === 1 && u.gy === 1)!
    const aTopRight = units.find((u) => u.gx === 2 && u.gy === 1)!
    const aBottomLeft = units.find((u) => u.gx === 1 && u.gy === 2)!
    // 同じ group の隣接マス間はボーダーなし
    expect(aTopLeft.borders.right).toBe(false)
    expect(aTopLeft.borders.bottom).toBe(false)
    // 空の内側に面する辺は外縁なのでボーダーあり
    expect(aTopRight.borders.bottom).toBe(true)
    expect(aTopRight.borders.right).toBe(true)
    expect(aBottomLeft.borders.right).toBe(true)
    expect(aBottomLeft.borders.bottom).toBe(true)
  })

  it('マップ境界にはボーダーを描く', () => {
    const cells: RenderedCell[] = [
      cell({ label: 'a', x: 1, y: 1, w: 2, h: 2, color: '#000' }),
    ]
    const units = buildUnits(cells)
    const topLeft = units.find((u) => u.gx === 1 && u.gy === 1)!
    expect(topLeft.borders.top).toBe(true)
    expect(topLeft.borders.left).toBe(true)
  })
})
