import { describe, it, expect } from 'vitest'
import { buildRuleSummaryRows } from '../lib/rulesSummary'
import type { RulesData } from '../data/schema'

function emptyMatrix(): string[][][] {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )
}

const mockRules: RulesData = {
  singleByDigit: {
    '1': { core: ['い'], sub: ['ひ'], bad: [] },
    '2': { core: ['に'], sub: ['ふ'], bad: [] },
  },
  doubleMatrix: (() => {
    const m = emptyMatrix()
    m[1][0] = ['と']
    m[1][2] = ['てぃ']
    m[1][7] = ['ひゅ', 'とぅ']
    m[2][1] = ['ふぃ']
    m[2][2] = ['ち']
    m[2][3] = ['つ']
    return m
  })(),
  longMatrix: (() => {
    const m = emptyMatrix()
    m[1][1] = ['いー', 'ひー']
    m[2][1] = ['にー']
    return m
  })(),
  weights: {},
}

describe('buildRuleSummaryRows', () => {
  it('generates rows for all digits 0-9', () => {
    const rows = buildRuleSummaryRows(mockRules)
    const digits = new Set(rows.map((r) => r.digit))
    for (let d = 0; d <= 9; d++) {
      expect(digits.has(d)).toBe(true)
    }
  })

  it('formats digit label with 1 for first in group and (1) for following lines', () => {
    const rows = buildRuleSummaryRows(mockRules)
    const rowsFor1 = rows.filter((r) => r.digit === 1)

    expect(rowsFor1.length).toBeGreaterThan(1)
    expect(rowsFor1[0].isFirstInGroup).toBe(true)
    expect(rowsFor1[0].singleDigitLabel).toBe('1')
    expect(rowsFor1[0].single?.kana).toBe('い')
    expect(rowsFor1[0].single?.tier).toBe('core')

    expect(rowsFor1[1].isFirstInGroup).toBe(false)
    expect(rowsFor1[1].singleDigitLabel).toBe('(1)')
    expect(rowsFor1[1].single?.kana).toBe('ひ')
    expect(rowsFor1[1].single?.tier).toBe('sub')

    expect(rowsFor1[2].isFirstInGroup).toBe(false)
    expect(rowsFor1[2].singleDigitLabel).toBe('(1)')
    expect(rowsFor1[2].single).toBeUndefined()
  })

  it('includes long readings when hideLong is false', () => {
    const rows = buildRuleSummaryRows(mockRules, { hideLong: false })
    const rowsFor1 = rows.filter((r) => r.digit === 1)

    // 10: と, 11: いー, ひー (long), 12: てぃ, 17: ひゅ, とぅ
    const doubleNums = rowsFor1
      .map((r) => r.double?.num)
      .filter((n): n is string => Boolean(n))
    expect(doubleNums).toEqual(['10', '11', '12', '17'])

    const row11 = rowsFor1.find((r) => r.double?.num === '11')
    expect(row11?.double?.kanas).toEqual([
      { kana: 'いー', isLong: true },
      { kana: 'ひー', isLong: true },
    ])

    // 21 has both double ('ふぃ') and long ('にー')
    const rowsFor2 = rows.filter((r) => r.digit === 2)
    const row21 = rowsFor2.find((r) => r.double?.num === '21')
    expect(row21?.double?.kanas).toEqual([
      { kana: 'ふぃ', isLong: false },
      { kana: 'にー', isLong: true },
    ])
  })

  it('excludes long readings when hideLong is true', () => {
    const rows = buildRuleSummaryRows(mockRules, { hideLong: true })
    const rowsFor1 = rows.filter((r) => r.digit === 1)

    // 11 should not be present as it only has long readings
    const doubleNums = rowsFor1
      .map((r) => r.double?.num)
      .filter((n): n is string => Boolean(n))
    expect(doubleNums).toEqual(['10', '12', '17'])
    expect(rowsFor1.some((r) => r.double?.num === '11')).toBe(false)

    // 21 should only have 'ふぃ'
    const rowsFor2 = rows.filter((r) => r.digit === 2)
    const row21 = rowsFor2.find((r) => r.double?.num === '21')
    expect(row21?.double?.kanas).toEqual([{ kana: 'ふぃ', isLong: false }])
  })
})
