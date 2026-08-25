import { describe, it, expect } from 'vitest'
import type { RulesData } from '../data/schema'
import {
  buildYomiItems,
  buildYomiQuestions,
  filterScope,
  shuffle,
  usageNote,
} from '../lib/yomiDrill'

const emptyMatrix = () =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )

function makeRules(): RulesData {
  const doubleMatrix = emptyMatrix()
  doubleMatrix[2][8] = ['ちゃ', 'つぁ']
  doubleMatrix[0][0] = ['ま'] // 1文字は2文字読みではない
  const longMatrix = emptyMatrix()
  longMatrix[9][8] = ['かー']
  return { singleByDigit: {}, doubleMatrix, longMatrix, weights: {} }
}

describe('buildYomiItems', () => {
  it('かな2文字だけを数字付きで取り出す', () => {
    const items = buildYomiItems(makeRules(), { ちゃ: ['428', '283'] })
    expect(items.map((i) => i.kana)).toEqual(['ちゃ', 'つぁ', 'かー'])
    expect(items[0]).toMatchObject({
      digits: '28',
      kind: 'youon',
      nums: ['428', '283'],
    })
    expect(items[2]).toMatchObject({ digits: '98', kind: 'long', nums: [] })
  })

  it('rules が無ければ空', () => {
    expect(buildYomiItems(undefined, undefined)).toEqual([])
  })
})

describe('filterScope', () => {
  it('拗音/長音で絞れる', () => {
    const items = buildYomiItems(makeRules(), undefined)
    expect(filterScope(items, 'youon').map((i) => i.kana)).toEqual([
      'ちゃ',
      'つぁ',
    ])
    expect(filterScope(items, 'long').map((i) => i.kana)).toEqual(['かー'])
    expect(filterScope(items, 'all')).toHaveLength(3)
  })
})

describe('shuffle', () => {
  it('元配列を壊さず、要素を落とさない', () => {
    const src = [1, 2, 3, 4, 5]
    const out = shuffle(src, () => 0.5)
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual(src)
  })
})

describe('buildYomiQuestions', () => {
  const items = buildYomiItems(makeRules(), { ちゃ: ['428'] })

  it('全部モードは重複なしで全件出す', () => {
    const qs = buildYomiQuestions(items, 0)
    expect(qs).toHaveLength(3)
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(3)
    expect(qs.every((q) => /^\d{2}$/.test(q.answer))).toBe(true)
  })

  it('出題数を指定すると重複なしで切り出す', () => {
    const qs = buildYomiQuestions(items, 2)
    expect(qs).toHaveLength(2)
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(2)
  })

  it('範囲より多い出題数は範囲の全件で打ち止め', () => {
    expect(buildYomiQuestions(items, 99)).toHaveLength(3)
  })

  it('割当数を note に添える', () => {
    const qs = buildYomiQuestions(items, 0)
    const cha = qs.find((q) => q.prompt === 'ちゃ')
    expect(cha?.note).toBe('割当 1 番号 · 428')
  })
})

describe('usageNote', () => {
  it('未使用は 0 と明示する', () => {
    expect(
      usageNote({ kana: 'かー', digits: '98', kind: 'long', nums: [] })
    ).toContain('割当 0')
  })

  it('7件以上は先頭6件 + 残数', () => {
    const nums = ['001', '002', '003', '004', '005', '006', '007', '008']
    const note = usageNote({ kana: 'しゃ', digits: '48', kind: 'youon', nums })
    expect(note).toBe('割当 8 番号 · 001 002 003 004 005 006 +2')
  })
})
