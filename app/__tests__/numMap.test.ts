import { describe, it, expect } from 'vitest'
import { buildNumMap, hasHundredLayout, HUNDRED_LAYOUTS } from '../lib/numMap'
import type { NumberEntry } from '../data/schema'

const num = (n: string, over: Partial<NumberEntry> = {}): NumberEntry => ({
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
  ...over,
})

const ALL_1XX = Array.from({ length: 100 }, (_, i) =>
  num(String(100 + i).padStart(3, '0'))
)

describe('hasHundredLayout', () => {
  it('100番台は定義済み、未設計の百は false', () => {
    expect(hasHundredLayout(1)).toBe(true)
    expect(hasHundredLayout(5)).toBe(false)
  })
})

describe('buildNumMap', () => {
  it('未設計の百は null', () => {
    expect(buildNumMap(ALL_1XX, 5)).toBeNull()
  })

  it('100-199 を漏れなく 100 件配置 (重複なし)', () => {
    const cells = buildNumMap(ALL_1XX, 1)!
    const tiles = cells.flatMap((c) => c.tiles)
    expect(tiles.length).toBe(100)
    const nums = new Set(tiles.map((t) => t.num))
    expect(nums.size).toBe(100)
    for (let i = 100; i <= 199; i++) {
      expect(nums.has(String(i))).toBe(true)
    }
  })

  it('tens グループ 1X0 のセルに 1X0-1X9 が入る', () => {
    const cells = buildNumMap(ALL_1XX, 1)!
    const g15 = cells.filter((c) => c.group === '150').flatMap((c) => c.tiles)
    expect(g15.map((t) => t.num).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => String(150 + i))
    )
  })

  it('tile は下2桁を表示し、画像は採用候補から引く', () => {
    const cells = buildNumMap([num('123', { w1: 'A', w1Img: 'imgA' })], 1)!
    const t = cells.flatMap((c) => c.tiles).find((x) => x.num === '123')!
    expect(t.xy).toBe('23')
    expect(t.img).toBe('imgA')
  })

  it('レイアウトの全 tens グループが 100番台を覆う', () => {
    const groups = new Set(
      HUNDRED_LAYOUTS[1].map((c) => c.label.replace(/-$/, ''))
    )
    for (let t = 0; t < 10; t++) expect(groups.has(`1${t}0`)).toBe(true)
  })
})
