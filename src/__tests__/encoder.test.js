import { describe, it, expect } from 'vitest'
import { encode, countDigits, isThreeDigits } from '../encoder.js'

describe('encode', () => {
  it('1桁かなのみ', () => {
    expect(encode('きれい')).toEqual({
      digits: '901',
      tokens: [
        { kana: 'き', value: '9' },
        { kana: 'れ', value: '0' },
        { kana: 'い', value: '1' },
      ],
      youon4: false,
    })
  })

  it('2桁かなのみ', () => {
    expect(encode('まち')).toEqual({
      digits: '0022',
      tokens: [
        { kana: 'ま', value: '00' },
        { kana: 'ち', value: '22' },
      ],
      youon4: false,
    })
  })

  it('拗音を優先マッチ', () => {
    expect(encode('きゃく')).toEqual({
      digits: '989',
      tokens: [
        { kana: 'きゃ', value: '98' },
        { kana: 'く', value: '9' },
      ],
      youon4: false,
    })
  })

  it('濁音は清音と同じ値', () => {
    expect(encode('かき').digits).toBe(encode('がぎ').digits)
  })

  it('半濁音も清音と同じ値', () => {
    expect(encode('はひ').digits).toBe(encode('ぱぴ').digits)
  })

  it('ジャジュジョ例外', () => {
    expect(encode('ジャ').digits).toBe('68')
    expect(encode('ジュ').digits).toBe('67')
    expect(encode('ジョ').digits).toBe('64')
  })

  it('ん → 0 (core)', () => {
    expect(encode('ん').digits).toBe('0')
  })

  it('long_digit: ん付き・長音', () => {
    expect(encode('さん').digits).toBe('36')
    expect(encode('きん').digits).toBe('90')
    expect(encode('きー').digits).toBe('91')
    expect(encode('かい').digits).toBe('91')
  })

  it('long_digit: ん付きは2文字マッチ優先', () => {
    // さん → 36 (long_digit), not さ(3)+ん(0)=30
    const result = encode('さん')
    expect(result.tokens).toEqual([{ kana: 'さん', value: '36' }])
  })

  it('促音: 後続文字の数字を繰り返す', () => {
    expect(encode('はっぴ').digits).toBe('811')
    expect(encode('はっぴ').tokens).toEqual([
      { kana: 'は', value: '8' },
      { kana: 'っ', value: '1' },
      { kana: 'ぴ', value: '1' },
    ])
  })

  it('促音: 後続が2桁かなの場合', () => {
    // カット: カ(9) + ッ(10) + ト(10)
    expect(encode('カット').digits).toBe('91010')
  })

  it('促音: 末尾の促音はエラー', () => {
    expect(() => encode('かっ')).toThrow('促音')
  })

  it('拗音4: う/んを省略して3桁', () => {
    // じょんき → じょ(64) + き(9) = 649, ん省略
    expect(encode('じょんき').digits).toBe('649')
    expect(encode('じょんき').youon4).toBe(true)
    // きゅうし → きゅ(97) + し(4) = 974, う省略
    expect(encode('きゅうし').digits).toBe('974')
    expect(encode('きゅうし').youon4).toBe(true)
  })

  it('拗音4: 4文字でない場合は通常エンコード', () => {
    // 3文字 → youon4 不適用
    expect(encode('きゅう').youon4).toBe(false)
    // 5文字以上 → youon4 不適用
    expect(encode('きれい').youon4).toBe(false)
  })

  it('unknown kana throws', () => {
    expect(() => encode('え')).toThrow('Unknown kana')
  })
})

describe('countDigits', () => {
  it.each([
    ['きれい', 3],
    ['にし', 2],
    ['きゃく', 3],
    ['まち', 4],
    ['はいく', 3],
  ])('%s → %d桁', (input, expected) => {
    expect(countDigits(input)).toBe(expected)
  })
})

describe('isThreeDigits', () => {
  it.each([
    ['きれい', true],
    ['きゃく', true],
    ['はいく', true],
    ['にし', false],
    ['まち', false],
  ])('%s → %s', (input, expected) => {
    expect(isThreeDigits(input)).toBe(expected)
  })
})
