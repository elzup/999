import { describe, it, expect } from 'vitest'
import { buildRecallTree } from '../lib/recallTree'
import type { NumberEntry, RulesData } from '../data/schema'

function mkNum(num: string, w1: string, w1k: string): NumberEntry {
  return {
    num,
    w1,
    w1k,
    w2: '',
    w2k: '',
    hito: '',
    mono: '',
    gainen: '',
    catScore: null,
    w1Score: null,
    w2Score: null,
  }
}

function emptyMatrix(): string[][][] {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )
}

const rules: RulesData = {
  singleByDigit: {
    '2': { core: ['に'], sub: ['ふ'], bad: [] },
    '0': { core: ['ん'], sub: ['お'], bad: ['れ'] },
  },
  doubleMatrix: (() => {
    const m = emptyMatrix()
    m[0][0] = ['ま']
    return m
  })(),
  longMatrix: emptyMatrix(),
  weights: {},
}

const numbers: NumberEntry[] = [
  mkNum('100', 'いま', 'いま'),
  mkNum('200', '', ''),
  mkNum('300', 'されん#pr', 'されん'),
  mkNum('400', 'しおん', 'しおん'),
]

describe('buildRecallTree', () => {
  const tree = buildRecallTree('200', rules, numbers)!

  it('returns null for invalid input', () => {
    expect(buildRecallTree('20', rules, numbers)).toBeNull()
    expect(buildRecallTree('abc', rules, numbers)).toBeNull()
  })

  it('exposes head readings ordered core→sub', () => {
    expect(tree.head.readings.map((r) => r.kana)).toEqual(['に', 'ふ'])
    expect(tree.head.readings.map((r) => r.tier)).toEqual(['core', 'sub'])
  })

  it('lists the 2-char (double) reading first', () => {
    expect(tree.combos[0]).toMatchObject({ kana: 'ま', type: 'double' })
  })

  it('flags mix when same digit uses different kana', () => {
    const on = tree.combos.find((c) => c.kana === 'おん')!
    expect(on.mix).toBe(true)
    const nn = tree.combos.find((c) => c.kana === 'んん')!
    expect(nn.mix).toBe(false)
  })

  it('collects example words by matching tail reading (tags stripped)', () => {
    const ma = tree.combos.find((c) => c.kana === 'ま')!
    expect(ma.examples.map((e) => e.word)).toContain('いま')
    const ren = tree.combos.find((c) => c.kana === 'れん')!
    expect(ren.examples.map((e) => e.word)).toContain('されん')
  })

  it('summarizes the registered distribution over siblings', () => {
    // 100=いま→ま, 300=されん→れん, 400=しおん→おん, 200=未登録
    expect(tree.dist.total).toBe(4)
    expect(tree.dist.unregistered).toBe(1)
    expect(tree.dist.other).toBe(0)
    const ma = tree.dist.items.find((d) => d.kana === 'ま')!
    expect(ma.count).toBe(1)
  })
})
