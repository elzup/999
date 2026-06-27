import { describe, it, expect } from 'vitest'
import { candidatesOf, resolveSlot, candidateAt } from '../lib/choice'
import type { NumberEntry } from '../data/schema'

const base = (over: Partial<NumberEntry>): NumberEntry => ({
  num: '079',
  wh1: '',
  wh1k: '',
  wh1Img: '',
  wh2: '',
  wh2k: '',
  wh2Img: '',
  wh3: '',
  wh3k: '',
  wh3Img: '',
  wm1: '',
  wm1k: '',
  wm1Img: '',
  wm2: '',
  wm2k: '',
  wm2Img: '',
  wm3: '',
  wm3k: '',
  wm3Img: '',
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
    const e = base({ wh1: 'ナギ', wh1Img: 'a', wm1: '泣く', wm1Img: 'b' })
    const cs = candidatesOf(e)
    expect(cs.map((c) => c.slot)).toEqual(['wh1', 'wm1'])
    expect(cs[1]).toMatchObject({ word: '泣く', img: 'b' })
  })

  it('wh2 / wm2 も候補に含む', () => {
    const e = base({ wh1: 'A', wh2: 'B', wh2Img: 'i' })
    expect(candidatesOf(e).map((c) => c.slot)).toEqual(['wh1', 'wh2'])
  })
})

describe('resolveSlot', () => {
  // ymapPicks.json の既定に含まれない番号を使う (テストを既定から独立させる)
  const e = base({ num: '055', wh1: 'ナギ', wm1: '泣く' })

  it('override を最優先', () => {
    expect(resolveSlot(e, { '055': 'wm1' })).toBe('wm1')
  })

  it('override もリポジトリ既定も無ければ最初の候補', () => {
    expect(resolveSlot(e, {})).toBe('wh1')
  })

  it('存在しないスロット指定は無視して候補にフォールバック', () => {
    expect(resolveSlot(e, { '055': 'w9' })).toBe('wh1')
  })

  it('候補ゼロなら null', () => {
    expect(resolveSlot(base({}), {})).toBeNull()
  })
})

describe('candidateAt', () => {
  it('指定スロットの候補を返す', () => {
    const e = base({ wh1: 'ナギ', wm1: '泣く', wm1Img: 'b' })
    expect(candidateAt(e, 'wm1')).toMatchObject({ word: '泣く', img: 'b' })
    expect(candidateAt(e, null)).toBeNull()
  })
})
