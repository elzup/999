import { describe, expect, it } from 'vitest'
import { applyMarks } from '../lib/reviewMarks'
import { numOfBmKey } from '../lib/numberContext'

describe('review marks', () => {
  it('印を付けた label の行だけ marked になる', () => {
    const items = [
      { label: '573', correct: true, rightAnswer: 'こなみ' },
      { label: '051', correct: false, rightAnswer: 'こい' },
    ]
    expect(applyMarks(items, new Set(['051'])).map((i) => i.marked)).toEqual([
      false,
      true,
    ])
  })

  it('番号のブックマークキーだけ詳細パネルの番号になる', () => {
    expect(numOfBmKey('n:573')).toBe('573')
    expect(numOfBmKey('c:SA')).toBeNull()
    expect(numOfBmKey(undefined)).toBeNull()
  })
})
