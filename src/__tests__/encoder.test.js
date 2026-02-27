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
    })
  })

  it('2桁かなのみ', () => {
    expect(encode('まち')).toEqual({
      digits: '0022',
      tokens: [
        { kana: 'ま', value: '00' },
        { kana: 'ち', value: '22' },
      ],
    })
  })

  it('拗音を優先マッチ', () => {
    expect(encode('きゃく')).toEqual({
      digits: '989',
      tokens: [
        { kana: 'きゃ', value: '98' },
        { kana: 'く', value: '9' },
      ],
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
