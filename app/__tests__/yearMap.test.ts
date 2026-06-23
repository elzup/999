import { describe, it, expect } from 'vitest'
import {
  classifyXY,
  membersByGroup,
  buildYearMap,
  getMapBounds,
  YEAR_MAP_LAYOUT,
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
