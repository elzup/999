import { describe, it, expect } from 'vitest'
import { candidatesOf, resolveSlot, candidateAt } from '../lib/choice'
import type { NumberEntry } from '../data/schema'

const base = (over: Partial<NumberEntry>): NumberEntry => ({
  num: '079',
  w1: '',
  w1k: '',
  w2: '',
  w2k: '',
  hito: '',
  mono: '',
  gainen: '',
  catScore: null,
  w1Score: null,
  w2Score: null,
  ...over,
})

describe('candidatesOf', () => {
  it('語句が空でないスロットだけ返す', () => {
    const e = base({ w1: 'ナギ', w1Img: 'a', w2: '泣く', w2Img: 'b' })
    const cs = candidatesOf(e)
    expect(cs.map((c) => c.slot)).toEqual(['w1', 'w2'])
    expect(cs[1]).toMatchObject({ word: '泣く', img: 'b' })
  })

  it('w1_2 / w2_2 も候補に含む', () => {
    const e = base({ w1: 'A', w1_2: 'B', w1_2Img: 'i' })
    expect(candidatesOf(e).map((c) => c.slot)).toEqual(['w1', 'w1_2'])
  })
})

describe('resolveSlot', () => {
  const e = base({ w1: 'ナギ', w2: '泣く' })

  it('override を最優先', () => {
    expect(resolveSlot(e, { '079': 'w2' })).toBe('w2')
  })

  it('override もリポジトリ既定も無ければ最初の候補', () => {
    expect(resolveSlot(e, {})).toBe('w1')
  })

  it('存在しないスロット指定は無視して候補にフォールバック', () => {
    expect(resolveSlot(e, { '079': 'w1_2' })).toBe('w1')
  })

  it('候補ゼロなら null', () => {
    expect(resolveSlot(base({}), {})).toBeNull()
  })
})

describe('candidateAt', () => {
  it('指定スロットの候補を返す', () => {
    const e = base({ w1: 'ナギ', w2: '泣く', w2Img: 'b' })
    expect(candidateAt(e, 'w2')).toMatchObject({ word: '泣く', img: 'b' })
    expect(candidateAt(e, null)).toBeNull()
  })
})
