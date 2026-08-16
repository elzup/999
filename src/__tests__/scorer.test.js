import { describe, it, expect } from 'vitest'
import { score, scoreWithLabel, getLabelPenalty, getTier } from '../scorer.js'

describe('getTier', () => {
  it('core かな', () => {
    expect(getTier('さ')).toBe('core')
    expect(getTier('き')).toBe('core')
    expect(getTier('ん')).toBe('core')
  })

  it('sub かな', () => {
    expect(getTier('ら')).toBe('sub')
    expect(getTier('う')).toBe('sub')
    expect(getTier('く')).toBe('sub')
  })

  it('bad かな', () => {
    expect(getTier('か')).toBe('bad')
    expect(getTier('あ')).toBe('bad')
    expect(getTier('れ')).toBe('bad')
    expect(getTier('え')).toBe('bad')
  })

  it('濁音は清音のティアを返す', () => {
    expect(getTier('が')).toBe('bad') // か → bad
    expect(getTier('ざ')).toBe('core') // さ → core
    expect(getTier('ば')).toBe('core') // は → core
  })

  it('カタカナも正規化', () => {
    expect(getTier('サ')).toBe('core')
    expect(getTier('ラ')).toBe('sub')
  })

  it('2桁かなは null', () => {
    expect(getTier('ま')).toBe(null)
  })
})

describe('score', () => {
  it('きれい: core + bad + core, 3桁ぴったり', () => {
    const result = score('きれい')
    expect(result.digits).toBe('901')
    expect(result.digitCount).toBe(3)
    expect(result.leadingZeroOmission).toBe(false)
    // き(core 1) + れ(bad 0.6) + い(core 1) = 2.6
    expect(result.score).toBe(2.6)
  })

  it('さとう: core + double(半はみ出し) + overflow', () => {
    const result = score('さとう')
    expect(result.digits).toBe('3107')
    expect(result.digitCount).toBe(4)
    // さ(core 1) + と(double at pos 1-2, fully in, 3) + う(pos 3, overflow -1)
    expect(result.score).toBe(1 + 3 + -1)
  })

  it('からす: bad + sub + double(半はみ出し), 4桁', () => {
    const result = score('からす')
    expect(result.digits).toBe('9533')
    expect(result.digitCount).toBe(4)
    // か(bad 0.6) + ら(sub 0.8) + す(double at pos 2-3, halfOverflow 0.4)
    expect(result.score).toBe(1.8)
  })

  it('にし: 2桁、先頭0省略ボーナス +1.5', () => {
    const result = score('にし')
    expect(result.digits).toBe('24')
    expect(result.digitCount).toBe(2)
    expect(result.leadingZeroOmission).toBe(true)
    // に(core 1) + し(core 1) + 先頭0省略(1.5) = 3.5
    expect(result.score).toBe(3.5)
  })

  it('きゃく: double + sub, 3桁, mix(9)', () => {
    const result = score('きゃく')
    expect(result.digits).toBe('989')
    expect(result.digitCount).toBe(3)
    expect(result.mix).toBe(true)
    // きゃ(double 3) + く(sub 0.8) + mix(-0.7) = 3.1
    expect(result.score).toBe(3.1)
  })

  it('tokens に type と tier が含まれる', () => {
    const result = score('さとう')
    expect(result.tokens).toEqual([
      { kana: 'さ', value: '3', type: 'single', tier: 'core', score: 1 },
      { kana: 'と', value: '10', type: 'double', tier: null, score: 3 },
      { kana: 'う', value: '7', type: 'overflow', tier: null, score: -1 },
    ])
  })

  it('はっぴ: core + sokuon + sub, 3桁', () => {
    const result = score('はっぴ')
    expect(result.digits).toBe('811')
    expect(result.digitCount).toBe(3)
    // は(core 1) + っ(sokuon 2) + ぴ(sub 0.8) = 3.8
    expect(result.score).toBe(3.8)
    expect(result.tokens[1].type).toBe('sokuon')
  })

  it('カット: bad + sokuon + overflow, 5桁', () => {
    const result = score('カット')
    expect(result.digits).toBe('91010')
    expect(result.digitCount).toBe(5)
    // カ(bad 0.6) + ッ(sokuon 2) + ト(overflow -1) = 1.6
    expect(result.score).toBe(1.6)
  })

  it('じょんき: 拗音4ルール, double + core + 省略(-0.5)', () => {
    const result = score('じょんき')
    expect(result.digits).toBe('649')
    expect(result.digitCount).toBe(3)
    expect(result.youon4).toBe(true)
    // じょ(double 3) + き(core 1) + youon4省略(-0.5) = 3.5
    expect(result.score).toBe(3.5)
  })

  it('きゅうし: 拗音4ルール, double + core + 省略(-0.5)', () => {
    const result = score('きゅうし')
    expect(result.digits).toBe('974')
    expect(result.digitCount).toBe(3)
    expect(result.youon4).toBe(true)
    // きゅ(double 3) + し(core 1) + youon4省略(-0.5) = 3.5
    expect(result.score).toBe(3.5)
  })

  it('きかい: き + か + い の3文字。かい の2文字ボーナスは廃止', () => {
    const result = score('きかい')
    expect(result.digits).toBe('991')
    expect(result.mix).toBe(true)
    // き(core 1) + か(bad 0.6) + い(core 1) + mix(-0.7) = 1.9
    expect(result.score).toBe(1.9)
  })

  it('なの: 同じ数字7が な と の で mix減点', () => {
    const result = score('なの')
    expect(result.digits).toBe('775')
    expect(result.mix).toBe(true)
    // な(core 1) + の(double 3) + mix(-0.7) = 3.3
    expect(result.score).toBe(3.3)
  })

  it('きれい: mixなし', () => {
    const result = score('きれい')
    expect(result.mix).toBe(false)
  })

  it('はっぴ: 促音はmix判定から除外', () => {
    const result = score('はっぴ')
    expect(result.mix).toBe(false)
    expect(result.score).toBe(3.8)
  })

  it('targetDigits を変更可能', () => {
    const result = score('きれい', 4)
    // 3桁だが target=4 → い は pos 2 で fullyIn + 先頭0省略(1.5)
    expect(result.digitCount).toBe(3)
    expect(result.leadingZeroOmission).toBe(true)
    expect(result.score).toBe(2.6 + 1.5)
  })
})

describe('scoreWithLabel', () => {
  it('ラベルの -x/-s/-n をそれぞれ -1 する', () => {
    expect(scoreWithLabel('きれい', 'キレイ -x').score).toBe(1.6)
    expect(scoreWithLabel('きれい', 'キレイ -s').score).toBe(1.6)
    expect(scoreWithLabel('きれい', 'キレイ -n').score).toBe(1.6)
  })

  it('タグ記法の # の直前にある -n も検出する', () => {
    const result = getLabelPenalty('茶湯 -n#g')
    expect(result).toEqual({ tags: ['-n'], penalty: -1 })
  })

  it('複数の対象ラベルがあれば合算する', () => {
    const result = scoreWithLabel('きれい', 'キレイ -x -s')
    expect(result.labelPenalty).toEqual({ tags: ['-x', '-s'], penalty: -2 })
    expect(result.score).toBe(0.6)
  })
})
