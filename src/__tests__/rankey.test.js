import { describe, expect, it } from 'vitest'
import { findOmission, leftoverMark, leftoverOf, rankey } from '../rankey.js'

describe('rankey notation', () => {
  // 記法の定義そのもの。合意した実例を仕様として固定する
  it.each([
    ['ばろん', '860', 'バロン', 'AAA|'],
    ['みかみ', '393', '三上', 'BCB|'],
    ['きた', '955', 'きた', 'Aww|'],
    ['ろっし', '644', 'ロッシ', 'AtA|'],
    ['しゅろ', '476', 'シュロ', 'AxA|'],
    ['みっき', '399', 'ミッキー', 'BtA|-'],
    ['にいさ', '213', 'にいさん', 'AAA|n'],
    ['たま', '550', '環', 'wwv|v'],
    ['ふり', '261', 'フリックル', 'Bww|..'],
    ['りんご', '615', 'りんご', 'ww!A|'],
    ['れい', '001', 'れい', '_CA|'],
  ])('notates %s (%s) as %s', (kana, num, word, expected) => {
    expect(rankey(kana, num, word)).toBe(expected)
  })

  it('marks a two-mora token per character, not as a youon', () => {
    // ろん(60) は ろ+ん の2音。しゅ(47) の x とは区別する
    expect(rankey('ばろん', '860', '')).toBe('AAA|')
    expect(rankey('しゅろ', '476', '')).toBe('AxA|')
  })

  it('keeps ん as a plain core digit inside the window', () => {
    // ん は single に 0(core) があるので、窓の中なら A、余りなら n
    expect(rankey('ばろん', '860', 'バロン')).toBe('AAA|')
    expect(rankey('にいさ', '213', 'にいさん')).toBe('AAA|n')
  })

  it('pads a short reading with an underscore per missing digit', () => {
    expect(rankey('れい', '001', '')).toBe('_CA|')
    expect(rankey('おに', '002', '')).toBe('_BA|')
  })

  it('appends m when the same digit is written with different kana', () => {
    // とま: と=10 と ま=00 の両方が 0 を担う
    expect(rankey('とま', '100', 'トマス')).toBe('wwv|v.m')
    expect(rankey('とま', '100', '')).toBe('wwv|vm')
  })

  it('marks a reading that overflows past three digits', () => {
    // のるん: の(75) る(6) ん(0) で4桁。あふれた ん は接尾の n
    expect(rankey('のるん', '756', 'ノルン')).toBe('wwB|n')
    expect(rankey('れすな', '037', 'レスナ')).toBe('Cww|.')
  })

  it('merges a reading overflow with a word leftover into one mark', () => {
    // 読みのあふれ(ん) + 語の余り(こ) で2文字 -> ..
    expect(rankey('のるん', '756', 'ノルンコ')).toBe('wwB|..')
  })

  it('reports a leftover only when the word is fully kana', () => {
    expect(leftoverOf('ミッキー', 'みっき')).toBe('ー')
    expect(leftoverOf('フリックル#tri', 'ふり')).toBe('っくる')
    expect(leftoverOf('環', 'たま')).toBe(null)
  })

  it.each([
    ['', ''],
    ['ん', 'n'],
    ['ー', '-'],
    ['す', '.'],
    ['っくる', '..'],
    ['うじーにょ', '..'],
  ])('marks the leftover %s as %s', (rest, expected) => {
    expect(leftoverMark(rest)).toBe(expected)
  })

  it('finds a middle omission only when skipping one kana hits the number', () => {
    expect(findOmission('りんご', '615')).toBe(1)
    expect(findOmission('みかみ', '393')).toBe(-1)
  })

  it('returns null for a reading that cannot be encoded', () => {
    expect(rankey('ゑゐ', '123', '')).toBe(null)
  })
})
