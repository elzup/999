import { describe, expect, it } from 'vitest'
import type { NumberEntry } from '../data/schema'
import { grade, worstRows } from '../lib/worstRank'

const entry = (num: string, slots: Record<string, string>) =>
  ({ num, ...slots }) as unknown as NumberEntry

describe('grade (型の判定)', () => {
  it('rankey から当たる型と一番悪い型の順位を出す', () => {
    expect(grade('101', 'とい', 'wwA|').ids).toEqual(['double'])
    expect(grade('131', 'いさい', 'AAA|')).toMatchObject({
      ids: ['regular3'],
      worst: 7,
      tier: 1,
    })
    expect(grade('269', 'ぶろｯく', 'BA!B|').ids).toContain('omitSokuon')
    expect(grade('143', 'いｰじす', 'A!Av|v').ids).toContain('omit')
    expect(grade('005', 'まご', 'wwA|', true).ids).toEqual([
      'zeroDouble',
      'concept',
    ])
  })
})

describe('worstRows (悪い順)', () => {
  it('語なしが先、次に一番良い語が悪い順。人 / 物は見ない', () => {
    const rows = worstRows([
      // 物だけ・良い語
      entry('101', { wm1: 'トイ', wm1k: 'とい' }),
      // 人だけ・型の悪い語
      entry('143', { wh1: 'イージス', wh1k: 'いｰじす' }),
      // 人と物 (良い方の 1 桁 × 3 拍で決まる)
      entry('131', {
        wh1: '異才',
        wh1k: 'いさい',
        wm1: 'イージス',
        wm1k: 'いｰじす',
      }),
    ])
    const nums = rows.map((row) => row.num)
    // 語なしの番号 (000 など) が先頭に来て、その後に 143 → 131 → 101
    expect(nums.indexOf('000')).toBeLessThan(nums.indexOf('143'))
    expect(nums.slice(-3)).toEqual(['143', '131', '101'])
    expect(rows).toHaveLength(1000)
  })
})
