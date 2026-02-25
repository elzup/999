import { describe, it, expect } from 'vitest'
import { score, getTier } from '../scorer.js'

describe('getTier', () => {
  it('core かな', () => {
    expect(getTier('さ')).toBe('core')
    expect(getTier('き')).toBe('core')
    expect(getTier('れ')).toBe('core')
  })

  it('sub かな', () => {
    expect(getTier('ら')).toBe('sub')
    expect(getTier('う')).toBe('sub')
    expect(getTier('く')).toBe('sub')
  })

  it('bad かな', () => {
    expect(getTier('か')).toBe('bad')
    expect(getTier('あ')).toBe('bad')
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
  it('きれい: 全 core 3桁 → 高スコア', () => {
    const result = score('きれい')
    expect(result.digits).toBe('901')
    expect(result.digitCount).toBe(3)
    expect(result.overflow).toBe(0)
    expect(result.underflow).toBe(0)
    expect(result.digitPenalty).toBe(0)
    // き(core +2) + れ(core +2) + い(core +2) = 6
    expect(result.score).toBe(6)
  })

  it('さとう: core + double + sub, 4桁 → はみ出し減点', () => {
    const result = score('さとう')
    expect(result.digits).toBe('3107')
    expect(result.digitCount).toBe(4)
    expect(result.overflow).toBe(1)
    // さ(core +2) + と(double +1) + う(sub -1) = 2, overflow -3
    expect(result.score).toBe(2 + -3)
  })

  it('からす: bad + sub + double, 4桁 → 低スコア', () => {
    const result = score('からす')
    expect(result.digits).toBe('9533')
    expect(result.digitCount).toBe(4)
    expect(result.overflow).toBe(1)
    // か(bad -2) + ら(sub -1) + す(double +1) = -2, overflow -3
    expect(result.score).toBe(-2 + -3)
  })

  it('にし: 2桁 → underflow 減点', () => {
    const result = score('にし')
    expect(result.digits).toBe('24')
    expect(result.digitCount).toBe(2)
    expect(result.underflow).toBe(1)
    // に(core +2) + し(core +2) = 4, underflow -3
    expect(result.score).toBe(4 + -3)
  })

  it('きゃく: double + sub, 3桁', () => {
    const result = score('きゃく')
    expect(result.digits).toBe('989')
    expect(result.digitCount).toBe(3)
    expect(result.overflow).toBe(0)
    // きゃ(double +1) + く(sub -1) = 0
    expect(result.score).toBe(0)
  })

  it('tokens に type と tier が含まれる', () => {
    const result = score('さとう')
    expect(result.tokens).toEqual([
      { kana: 'さ', value: '3', type: 'single', tier: 'core', score: 2 },
      { kana: 'と', value: '10', type: 'double', tier: null, score: 1 },
      { kana: 'う', value: '7', type: 'single', tier: 'sub', score: -1 },
    ])
  })

  it('targetDigits を変更可能', () => {
    const result = score('きれい', 4)
    // 3桁だが target=4 なので underflow 1
    expect(result.underflow).toBe(1)
    expect(result.digitPenalty).toBe(-3)
  })
})
