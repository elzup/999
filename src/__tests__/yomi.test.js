import { describe, it, expect } from 'vitest'
import { TWO_CHAR_YOMI, toYomiKey, buildYomiUse } from '../yomi.js'

describe('TWO_CHAR_YOMI', () => {
  it('かな2文字の読みだけを集める', () => {
    expect(TWO_CHAR_YOMI.every((y) => [...y.kana].length === 2)).toBe(true)
    expect(TWO_CHAR_YOMI.every((y) => /^\d{2}$/.test(y.digits))).toBe(true)
  })

  it('拗音系と長音系の両方を含む', () => {
    const kinds = new Set(TWO_CHAR_YOMI.map((y) => y.kind))
    expect(kinds).toEqual(new Set(['youon', 'long']))
    expect(TWO_CHAR_YOMI.find((y) => y.kana === 'ちゃ')).toMatchObject({
      digits: '28',
      kind: 'youon',
    })
    expect(TWO_CHAR_YOMI.find((y) => y.kana === 'かー')).toMatchObject({
      digits: '98',
      kind: 'long',
    })
  })
})

describe('toYomiKey', () => {
  it('カタカナ・濁点を表のキーに寄せる', () => {
    expect(toYomiKey('チャ')).toBe('ちゃ')
    expect(toYomiKey('ヂャ')).toBe('ちゃ')
    expect(toYomiKey('じゃ')).toBe('じゃ') // 濁音のまま別キー (68)
  })

  it('表に無いものは null', () => {
    expect(toYomiKey('あい')).toBe(null)
    expect(toYomiKey('か')).toBe(null)
  })
})

describe('buildYomiUse', () => {
  it('w1k/w2k に現れた読みの番号を集める', () => {
    const use = buildYomiUse([
      { num: '428', w1k: 'ちゃんぴおん', w2k: '' },
      { num: '283', w1k: '', w2k: 'ちゃぶだい' },
      { num: '058', w1k: 'ふぁん', w2k: '' },
    ])
    expect(use['ちゃ']).toEqual([
      { num: '283', slot: 'w2' },
      { num: '428', slot: 'w1' },
    ])
    expect(use['ふぁ']).toEqual([{ num: '058', slot: 'w1' }])
  })

  it('同じ番号・同じスロットは重複させない (スロット違いは残す)', () => {
    const use = buildYomiUse([{ num: '288', w1k: 'ちゃちゃ', w2k: 'ちゃ' }])
    expect(use['ちゃ']).toEqual([
      { num: '288', slot: 'w1' },
      { num: '288', slot: 'w2' },
    ])
  })

  it('全ての読みをキーに持ち、未使用は空配列', () => {
    const use = buildYomiUse([])
    expect(Object.keys(use)).toHaveLength(TWO_CHAR_YOMI.length)
    expect(Object.values(use).every((hits) => hits.length === 0)).toBe(true)
  })

  it('表に無いかなを含む語は飛ばす (throw しない)', () => {
    expect(() =>
      buildYomiUse([{ num: '000', w1k: 'abc', w2k: '' }])
    ).not.toThrow()
  })
})
