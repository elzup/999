import { describe, it, expect } from 'vitest'
import { score, getTier } from '../scorer.js'

describe('getTier', () => {
  it('core かな', () => {
    expect(getTier('さ')).toBe('core')
    expect(getTier('き')).toBe('core')
    expect(getTier('ん')).toBe('core')
  })

  it('sub かな', () => {
    expect(getTier('ら')).toBe('sub')
    expect(getTier('う')).toBe('sub')
    expect(getTier('く')).toBe('sub')
  })

  it('bad かな', () => {
    expect(getTier('か')).toBe('bad')
    expect(getTier('あ')).toBe('bad')
    expect(getTier('れ')).toBe('bad')
  })

  it('濁音は清音のティアを返す', () => {
    expect(getTier('が')).toBe('bad') // か → bad
    expect(getTier('ざ')).toBe('core') // さ → core
    expect(getTier('ば')).toBe('core') // は → core
  })

  it('カタカナも正規化', () => {
    expect(getTier('サ')).toBe('core')
    expect(getTier('ラ')).toBe('sub')
  })

  it('2桁かなは null', () => {
    expect(getTier('ま')).toBe(null)
  })
})

describe('score', () => {
  it('きれい: core + bad + core, 3桁ぴったり', () => {
    const result = score('きれい')
    expect(result.digits).toBe('901')
    expect(result.digitCount).toBe(3)
    // き(core 10) + れ(bad 6) + い(core 10) = 26
    expect(result.score).toBe(26)
  })

  it('さとう: core + double(半はみ出し) + overflow', () => {
    const result = score('さとう')
    expect(result.digits).toBe('3107')
    expect(result.digitCount).toBe(4)
    // さ(core 10) + と(double at pos 1-2, fully in, 30) + う(pos 3, overflow -10)
    expect(result.score).toBe(10 + 30 + -10)
  })

  it('からす: bad + sub + double(半はみ出し), 4桁', () => {
    const result = score('からす')
    expect(result.digits).toBe('9533')
    expect(result.digitCount).toBe(4)
    // か(bad 6) + ら(sub 8) + す(double at pos 2-3, halfOverflow 4)
    expect(result.score).toBe(6 + 8 + 4)
  })

  it('にし: 2桁、underflow ペナルティなし', () => {
    const result = score('にし')
    expect(result.digits).toBe('24')
    expect(result.digitCount).toBe(2)
    // に(core 10) + し(core 10) = 20
    expect(result.score).toBe(20)
  })

  it('きゃく: double + sub, 3桁', () => {
    const result = score('きゃく')
    expect(result.digits).toBe('989')
    expect(result.digitCount).toBe(3)
    // きゃ(double 30) + く(sub 8) = 38
    expect(result.score).toBe(38)
  })

  it('tokens に type と tier が含まれる', () => {
    const result = score('さとう')
    expect(result.tokens).toEqual([
      { kana: 'さ', value: '3', type: 'single', tier: 'core', score: 10 },
      { kana: 'と', value: '10', type: 'double', tier: null, score: 30 },
      { kana: 'う', value: '7', type: 'overflow', tier: null, score: -10 },
    ])
  })

  it('targetDigits を変更可能', () => {
    const result = score('きれい', 4)
    // 3桁だが target=4 → い は pos 2 で fullyIn
    expect(result.digitCount).toBe(3)
    expect(result.score).toBe(26)
  })
})
