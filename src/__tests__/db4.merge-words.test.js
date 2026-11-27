import { describe, expect, it } from 'vitest'
import { applyMerge, mergePlan } from '../db4/merge-words.js'
import { checkIntegrity } from '../db4/integrity.js'
import { syncNumber } from '../db4/sync-number.js'

const w = (id, text, source) => ({
  id,
  text,
  labels: [],
  ...(source ? { source } : {}),
})
const sym = (id, kind, links) => ({
  id,
  kind,
  links,
  wordIds: [...new Set(links.map((l) => l.wordId))],
})
const link = (wordId, role, order = 0) => ({ wordId, role, order })

describe('mergePlan (D-0178 / D-0179)', () => {
  it('hex のタグ無しの語は、同じ表記のタグ付きの人の語にまとめる', () => {
    const words = [w('w_hex', 'こいし'), w('w_num', 'こいし', '東方')]
    const symbols = [
      sym('hex:5E', 'hex', [link('w_hex', 'hex')]),
      sym('num:514', 'num', [link('w_num', 'person')]),
    ]
    const plan = mergePlan({ symbols, words })
    expect([...plan]).toEqual([['w_hex', 'w_num']])
    const next = applyMerge({ symbols, words }, plan)
    expect(next.words.map((x) => x.id)).toEqual(['w_num'])
    // C8 (ID の形) はテスト用の短い ID なので見ない
    expect(checkIntegrity(next).errors.filter((e) => e.rule !== 'C8')).toEqual(
      []
    )
  })

  it('タグ違いはまとめない。タグ無しは語の多いタグの方へ', () => {
    const words = [
      w('w_a', 'リコ', 'shingeki'),
      w('w_b', 'リコ', 'abyss'),
      w('w_x', '他', 'shingeki'),
      w('w_hex', 'リコ'),
    ]
    const symbols = [
      sym('num:615', 'num', [link('w_a', 'person'), link('w_b', 'person')]),
      sym('num:001', 'num', [link('w_x', 'thing')]),
      sym('hex:6F', 'hex', [link('w_hex', 'hex')]),
    ]
    expect([...mergePlan({ symbols, words })]).toEqual([['w_hex', 'w_a']])
  })

  it('人と物は分けたまま。番号 2 つで同じ語にはしない (C9)', () => {
    const words = [w('w_p', 'トロ'), w('w_t', 'トロ'), w('w_o', 'トロ')]
    const symbols = [
      sym('num:106', 'num', [link('w_p', 'person'), link('w_t', 'thing')]),
      sym('num:107', 'num', [link('w_o', 'person')]),
    ]
    expect(mergePlan({ symbols, words }).size).toBe(0)
  })
})

describe('syncNumber: 他の記号の同じ表記の語に結び付ける', () => {
  it('足した語は hex の同じ表記の語と共有し、その語のタグを消さない', () => {
    const near = [w('w_hexword', 'ジーク', 'aot')]
    const nearUsage = new Map([
      ['w_hexword', [{ id: 'hex:41', kind: 'hex', roles: ['hex'] }]],
    ])
    const result = syncNumber({
      nextDoc: {
        num: '419',
        slots: { wh1: { word: 'ジーク', kana: 'じーく' } },
      },
      near,
      nearUsage,
      issue: () => 'w_new0000000',
    })
    expect(result.symbol.wordIds).toEqual(['w_hexword'])
    expect(result.upsertWords).toEqual([])
  })

  it('消した語の位置に足した語は、前の語の画像を引き継がない', () => {
    const prevSymbol = sym('num:419', 'num', [link('w_old', 'person')])
    const prevWords = [{ ...w('w_old', 'エレン'), imageUrl: 'https://x/old' }]
    const result = syncNumber({
      prevSymbol,
      prevWords,
      nextDoc: {
        num: '419',
        slots: { wh1: { word: 'ジーク', kana: 'じーく' } },
      },
      issue: () => 'w_new0000000',
    })
    expect(result.upsertWords).toHaveLength(1)
    expect(result.upsertWords[0].text).toBe('ジーク')
    expect(result.upsertWords[0].imageUrl).toBeUndefined()
  })

  it('同じ kind の別の記号の語には結び付けない (C9)', () => {
    const near = [w('w_other', 'ジーク')]
    const nearUsage = new Map([
      ['w_other', [{ id: 'num:420', kind: 'num', roles: ['person'] }]],
    ])
    const result = syncNumber({
      nextDoc: {
        num: '419',
        slots: { wh1: { word: 'ジーク', kana: 'じーく' } },
      },
      near,
      nearUsage,
      issue: () => 'w_new0000000',
    })
    expect(result.symbol.wordIds).toEqual(['w_new0000000'])
  })
})
