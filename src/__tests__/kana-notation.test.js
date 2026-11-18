import { describe, expect, it } from 'vitest'
import {
  KANA_CELL_PATTERN,
  hasNotation,
  parseNotation,
  stripNotation,
} from '../kana-notation.js'
import { encode } from '../encoder.js'
import { rankey } from '../rankey.js'
import { score } from '../scorer.js'

describe('記法 [す] の分解', () => {
  it('地のかなと 1 桁読みの区間に分ける', () => {
    expect(parseNotation('い[わ]お')).toEqual([
      { text: 'い', half: false, skip: false },
      { text: 'わ', half: true, skip: false },
      { text: 'お', half: false, skip: false },
    ])
    expect(stripNotation('[す]うる')).toBe('すうる')
    expect(hasNotation('すうる')).toBe(false)
  })

  it('括弧が閉じていない・中身がひらがなでないものは読めない', () => {
    expect(() => parseNotation('[すう')).toThrow()
    expect(() => parseNotation('す]う')).toThrow()
    expect(() => parseNotation('[x]すう')).toThrow()
  })

  it('シートの check 列と同じ形を正しいかなとみなす', () => {
    const re = new RegExp(KANA_CELL_PATTERN)
    expect(re.test('すうる')).toBe(true)
    expect(re.test('[す]うる')).toBe(true)
    expect(re.test('[ちゃ]い')).toBe(true)
    expect(re.test('さば(ん)な')).toBe(true)
    expect(re.test('さば(ん')).toBe(false)
    expect(re.test('さば(x)な')).toBe(false)
    expect(re.test('すうる[x]')).toBe(false)
    expect(re.test('[すう')).toBe(false)
    expect(re.test('スうる')).toBe(false)
  })
})

describe('記法付きのよみの読み', () => {
  it('[ ] の中は 2 桁の 1 桁目だけを読む', () => {
    expect(encode('[す]うる').digits).toBe('376')
    expect(encode('い[わ]お').digits).toBe('180')
    expect(encode('[つ]ばさ').digits).toBe('283')
  })

  it('1 桁しか読まないかなや 2 トークンは囲めない', () => {
    expect(() => encode('[い]う')).toThrow()
    expect(() => encode('[あい]')).toThrow()
  })

  it('rankey は 1 桁読みを h で表し、余りは記号を外したかなで測る', () => {
    expect(rankey('[す]うる', '376', 'スール')).toBe('hBB|')
    expect(rankey('[つ]ばさ', '283', '翼')).toBe('hAA|')
    expect(rankey('[す]うる', '376', 'すうるん')).toBe('hBB|n')
  })

  it('採点では 1 桁読みを half として扱う', () => {
    const { tokens } = score('[す]うる')
    expect(tokens[0]).toMatchObject({ kana: 'す', type: 'half', value: '3' })
  })
})

describe('記法 ( ) (読まないかな)', () => {
  it('地のかなと読まない区間に分け、記号を外すとかなは残る', () => {
    expect(parseNotation('さば(ん)な')).toEqual([
      { text: 'さば', half: false, skip: false },
      { text: 'ん', half: false, skip: true },
      { text: 'な', half: false, skip: false },
    ])
    expect(stripNotation('さば(ん)な')).toBe('さばんな')
    expect(stripNotation('[す](う)る')).toBe('すうる')
    expect(hasNotation('さば(ん)な')).toBe(true)
  })

  it('括弧が閉じていない・中身がひらがなでないものは読めない', () => {
    expect(() => parseNotation('さば(んな')).toThrow()
    expect(() => parseNotation('さば)ん(な')).toThrow()
    expect(() => parseNotation('さば(x)な')).toThrow()
  })

  it('( ) の中は数字にしない', () => {
    expect(encode('さば(ん)な').digits).toBe('387')
    expect(encode('り(ん)ご').digits).toBe('615')
    // 1 桁読みと一緒に使える
    expect(encode('[す](う)る').digits).toBe('36')
  })

  it('rankey は自動で見つけた中間省略と同じ ! を、記法の位置に置く', () => {
    expect(rankey('さば(ん)な', '387')).toBe(rankey('さばんな', '387'))
    expect(rankey('さば(ん)な', '387')).toBe('AA!A|')
    expect(rankey('り(ん)ご', '615')).toBe('ww!A|')
  })

  it('記法があれば自動の探索はしない (書いた読み方を優先する)', () => {
    // さ(ば)んな = 307。番号 387 に合わせて別の 1 文字を飛ばしたりしない
    expect(score('さ(ば)んな').digits).toBe('307')
    expect(rankey('さ(ば)んな', '387')).toBe('A!AA|')
  })
})
