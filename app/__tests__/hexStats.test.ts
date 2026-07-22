import { describe, it, expect } from 'vitest'
import {
  confusionsOf,
  confusionKey,
  accumulate,
  summarize,
  type HexStats,
} from '../lib/hexStats'

describe('confusionsOf', () => {
  it('異なる桁だけを Confusion にする', () => {
    // AB (0xAB) vs A9 (0xA9): 下位だけ違う
    expect(confusionsOf(0xab, 0xa9)).toEqual([
      { pos: 'lo', from: 'B', to: '9' },
    ])
    // AB vs CB: 上位だけ違う
    expect(confusionsOf(0xab, 0xcb)).toEqual([
      { pos: 'hi', from: 'A', to: 'C' },
    ])
    // AB vs C9: 両方違う
    expect(confusionsOf(0xab, 0xc9)).toEqual([
      { pos: 'hi', from: 'A', to: 'C' },
      { pos: 'lo', from: 'B', to: '9' },
    ])
    // 同じ → 空
    expect(confusionsOf(0xab, 0xab)).toEqual([])
  })
})

describe('confusionKey', () => {
  it('pos:from>to 形式', () => {
    expect(confusionKey({ pos: 'lo', from: 'B', to: '9' })).toBe('lo:B>9')
  })
})

describe('accumulate', () => {
  it('回数を足し、元を破壊しない', () => {
    const a: HexStats = {}
    const b = accumulate(a, confusionsOf(0xab, 0xc9))
    expect(a).toEqual({})
    expect(b).toEqual({ 'hi:A>C': 1, 'lo:B>9': 1 })
    const c = accumulate(b, confusionsOf(0xab, 0xa9))
    expect(c['lo:B>9']).toBe(2)
    expect(c['hi:A>C']).toBe(1)
  })
})

describe('summarize', () => {
  it('文字ランキングとペアを回数降順で返す', () => {
    let stats: HexStats = {}
    stats = accumulate(stats, confusionsOf(0xab, 0xa9)) // B>9
    stats = accumulate(stats, confusionsOf(0x1b, 0x19)) // B>9 (別バイトでも同じ桁化け)
    stats = accumulate(stats, confusionsOf(0xab, 0xcb)) // A>C

    const { total, byChar, pairs } = summarize(stats)
    expect(total).toBe(3)

    // B が2回で最上位
    expect(byChar[0]).toEqual({ char: 'B', count: 2 })
    expect(byChar.find((c) => c.char === 'A')).toEqual({ char: 'A', count: 1 })

    // ペア B>9 が2回
    expect(pairs[0]).toEqual({ from: 'B', to: '9', count: 2 })
  })

  it('空なら total 0', () => {
    expect(summarize({})).toEqual({ total: 0, byChar: [], pairs: [] })
  })
})
