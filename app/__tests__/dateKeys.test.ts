import { describe, it, expect } from 'vitest'
import { allDateDays, buildDateEntries, dateKey } from '../lib/dateKeys'
import type { NumberEntry } from '../data/schema'

const entry = (num: string, w1 = ''): NumberEntry =>
  ({
    num,
    w1,
    w1k: '',
    w2: '',
    w2k: '',
    hito: '',
    mono: '',
    gainen: '',
    catScore: null,
    w1Score: null,
    w2Score: null,
  }) as NumberEntry

describe('dateKey', () => {
  it('月はそのまま、日は2桁ゼロ埋め', () => {
    expect(dateKey(1, 1)).toBe('101')
    expect(dateKey(9, 30)).toBe('930')
    expect(dateKey(10, 1)).toBe('1001')
    expect(dateKey(12, 31)).toBe('1231')
  })
})

describe('allDateDays', () => {
  it('365日分 (2/29 なし)', () => {
    const days = allDateDays()
    expect(days).toHaveLength(365)
    expect(days[0].key).toBe('101')
    expect(days[364].key).toBe('1231')
    expect(days.some((d) => d.key === '229')).toBe(false)
    expect(new Set(days.map((d) => d.key)).size).toBe(365)
  })

  it('4桁は10〜12月だけ', () => {
    const four = allDateDays().filter((d) => d.key.length === 4)
    expect(four).toHaveLength(31 + 30 + 31)
    expect(four.every((d) => d.month >= 10)).toBe(true)
  })
})

describe('buildDateEntries', () => {
  it('3桁は numbers、4桁は dates を引き、無い日は空で埋める', () => {
    const list = buildDateEntries(
      [entry('101', 'いち'), entry('1001', '混入')],
      [entry('1001', 'じゅう')]
    )
    expect(list).toHaveLength(365)
    expect(list[0].entry.w1).toBe('いち')
    expect(list.find((d) => d.key === '1001')?.entry.w1).toBe('じゅう')
    const empty = list.find((d) => d.key === '1231')!
    expect(empty.entry.num).toBe('1231')
    expect(empty.entry.w1).toBe('')
  })
})
