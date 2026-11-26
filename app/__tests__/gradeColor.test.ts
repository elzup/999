import { describe, expect, it } from 'vitest'
import { byGrade, decadeGrades, gradeColor } from '../lib/gradeColor'
import type { GradedWord } from '../lib/worstRank'

const word = (over: Partial<GradedWord>): GradedWord => ({
  kana: 'いま',
  rankey: 'Aww|',
  ids: ['double'],
  worst: 1,
  tier: 1,
  key: 'wh1',
  word: 'いま',
  rating: null,
  repRank: 0,
  ...over,
})

describe('gradeColor', () => {
  it('1 位が緑、20 位が赤、範囲外は端に寄せる', () => {
    expect(gradeColor(1)).toBe('hsl(130 70% 55%)')
    expect(gradeColor(20)).toBe('hsl(0 70% 55%)')
    expect(gradeColor(0)).toBe(gradeColor(1))
    expect(gradeColor(99)).toBe(gradeColor(20))
  })
})

describe('byGrade', () => {
  it('悪い順と同じ並び。評価 -1 は格が良くても後ろ', () => {
    const list = [
      word({ key: 'a', worst: 12 }),
      word({ key: 'b', worst: 1, rating: -1 }),
      word({ key: 'c', worst: 3 }),
    ]
    expect([...list].sort(byGrade).map((w) => w.key)).toEqual(['c', 'a', 'b'])
  })
})

describe('decadeGrades', () => {
  it('文書の無い番号は語なし (null) で、良い順の最後', () => {
    const grades = decadeGrades([], '1')
    expect(grades).toHaveLength(10)
    expect(grades[0]).toEqual(Array(10).fill(null))
  })
})
