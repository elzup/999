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
    ['りﾝご', '615', 'りんご', 'ww!A|'],
    ['れい', '001', 'れい', '_CA|'],
  ])('notates %s (%s) as %s', (kana, num, word, expected) => {
    expect(rankey(kana, num, word)).toBe(expected)
  })

  it('marks a two-mora token per character, not as a youon', () => {
    // ろん(60) は ろ+ん の2音。しゅ(47) の x とは区別する
    expect(rankey('ばろん', '860', '')).toBe('AAA|')
    expect(rankey('しゅろ', '476', '')).toBe('AxA|')
  })

  it('marks an omission only where the reading writes one (D-0118)', () => {
    // ー / っ を飛ばすよみは記法 (半角カナ) で書く。記法が無ければ語と突き合わせない
    expect(rankey('いｰじす', '143', 'イージス')).toBe('A!Av|v')
    expect(rankey('いじす', '143', 'イージス')).toBe('AAv|v')
    // 記法の後ろに残った語のかな (ー) は余り
    expect(rankey('ふなｯし', '274', 'ふなっしー')).toBe('BA!A|-')
    // 語の頭から読んでいるよみは今までどおり (余りだけ)
    expect(rankey('みっき', '399', 'ミッキー')).toBe('BtA|-')
  })

  it('marks a sokuon that copies a two-digit kana as t + w, and its source past the window as |w', () => {
    // はっと: は8 っ10 と10。っ は と を丸ごと写す (D-0123)
    expect(rankey('はっと', '810', 'ハット')).toBe('Atw|w')
    expect(rankey('しっぺ', '489', 'しっぺ')).toBe('Atw|w')
    // 写した元が語尾に書いてあっても同じ
    expect(rankey('ひっ+ち', '122', 'ヒッチ')).toBe('Btw|w')
    // 1 桁のかなを写す促音はそのまま t
    expect(rankey('ろっし', '644', 'ロッシ')).toBe('AtA|')
  })

  it('marks a small vowel (ぃ) as the x side like a youon', () => {
    // てぃ(12) の ぃ は独立した音ではない。い (core) と見て AwA にしない
    expect(rankey('さてぃ', '312', 'サティ')).toBe('Awx|')
    expect(rankey('ふぃる', '216', 'フィルム')).toBe('BxB|.')
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
    // れじん: れ と ん がどちらも 0 (1 桁読みどうし)
    expect(rankey('れじん', '040', 'レジン')).toBe('CAA|m')
    // 2 桁読みの中の数字は数えない: とま (と=10 / ま=00)、とい (と=10 / い=1)
    expect(rankey('とま', '100', 'トマス')).toBe('wwv|v.')
    expect(rankey('とい', '101', 'とい')).toBe('wwA|')
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
