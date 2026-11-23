import { describe, expect, it } from 'vitest'
import type { NumberDoc } from '../lib/numberApi'
import { LEVEL, grade, worstRowOf, worstRows } from '../lib/worstRank'

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

const doc = (num: string, over: Partial<NumberDoc>): NumberDoc => ({
  num,
  slots: {},
  ...over,
})

describe('worstRowOf (番号の良し悪しを決める語)', () => {
  const slots = {
    wh1: { word: '異才', kana: 'いさい' },
    wm1: { word: 'イージス', kana: 'いｰじす' },
  }

  it('代表があれば代表 ①② の良い方で決める (語全部の一番良い語ではなく)', () => {
    const row = worstRowOf(
      '131',
      doc('131', {
        slots,
        rep: { picks: [{ k: 'いｰじす', w: 'イージス' }], confirmed: true },
      })
    )
    expect(row).toMatchObject({ level: LEVEL.graded, fromRep: true })
    expect(row.basis?.word).toBe('イージス')
  })

  it('代表が無ければ語全部の中で一番良い語', () => {
    const row = worstRowOf('131', doc('131', { slots }))
    expect(row.fromRep).toBe(false)
    expect(row.basis?.word).toBe('異才')
  })

  it('評価 -1 の語は数えず、-1 しか無ければ «語なし» の次', () => {
    const ratings = [
      { k: 'いさい', w: '異才', v: -1 },
      { k: 'いｰじす', w: 'イージス', v: -1 },
    ]
    expect(worstRowOf('131', doc('131', { slots, ratings })).level).toBe(
      LEVEL.onlyBad
    )
    expect(worstRowOf('131', undefined).level).toBe(LEVEL.none)
  })
})

describe('worstRows (悪い順)', () => {
  it('語なし → -1 しか無い → 決めた語の型が悪い順', () => {
    const rows = worstRows([
      doc('101', { slots: { wm1: { word: 'トイ', kana: 'とい' } } }),
      doc('143', { slots: { wh1: { word: 'イージス', kana: 'いｰじす' } } }),
      doc('131', {
        slots: { wh1: { word: '異才', kana: 'いさい' } },
        ratings: [{ k: 'いさい', w: '異才', v: -1 }],
      }),
    ])
    expect(rows).toHaveLength(1000)
    const nums = rows.map((row) => row.num)
    // 語なしの 997 番号が先、次に -1 しか無い 131、その後に型の悪い 143 → 良い 101
    expect(nums.slice(-3)).toEqual(['131', '143', '101'])
    expect(rows[0].level).toBe(LEVEL.none)
  })
})
