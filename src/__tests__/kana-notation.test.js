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

describe('半指定 (カタカナ) の分解', () => {
  it('地のかなと 1 桁読みの区間に分ける', () => {
    expect(parseNotation('いワお')).toEqual([
      { text: 'い', hira: 'い', half: false, skip: false },
      { text: 'ワ', hira: 'わ', half: true, skip: false },
      { text: 'お', hira: 'お', half: false, skip: false },
    ])
    expect(stripNotation('スうる')).toBe('すうる')
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
    expect(re.test('スうる')).toBe(true)
    expect(re.test('チャい')).toBe(true)
    expect(re.test('さば(ん)な')).toBe(true)
    expect(re.test('さば(ん')).toBe(false)
    expect(re.test('さば(x)な')).toBe(false)
    expect(re.test('すうる[x]')).toBe(false)
    expect(re.test('[すう')).toBe(false)
    // 廃止した [ ] 記法とカタカナの半端な書き方は不正
    expect(re.test('[す]うる')).toBe(false)
    expect(re.test('すうるー')).toBe(false)
  })
})

describe('記法付きのよみの読み', () => {
  it('カタカナの字は 2 桁の 1 桁目だけを読む', () => {
    expect(encode('スうる').digits).toBe('376')
    expect(encode('いワお').digits).toBe('180')
    expect(encode('ツばさ').digits).toBe('283')
  })

  it('1 桁しか読まないかなは半指定にできず、[ ] は読めない', () => {
    expect(() => encode('[す]うる')).toThrow()
    expect(() => encode('パそ')).toThrow()
    expect(() => encode('イう')).toThrow()
    expect(() => encode('アイ')).toThrow()
  })

  it('rankey は 1 桁読みを h で表し、余りは記号を外したかなで測る', () => {
    expect(rankey('スうる', '376', 'スール')).toBe('hBB|')
    expect(rankey('ツばさ', '283', '翼')).toBe('hAA|')
    expect(rankey('スうる', '376', 'すうるん')).toBe('hBB|n')
  })

  it('採点では 1 桁読みを half として扱う', () => {
    const { tokens } = score('スうる')
    expect(tokens[0]).toMatchObject({ kana: 'す', type: 'half', value: '3' })
  })
})

describe('記法 ( ) (読まないかな)', () => {
  it('地のかなと読まない区間に分け、記号を外すとかなは残る', () => {
    expect(parseNotation('さば(ん)な')).toEqual([
      { text: 'さば', hira: 'さば', half: false, skip: false },
      { text: 'ん', hira: 'ん', half: false, skip: true },
      { text: 'な', hira: 'な', half: false, skip: false },
    ])
    expect(stripNotation('さば(ん)な')).toBe('さばんな')
    expect(stripNotation('ス(う)る')).toBe('すうる')
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
    expect(encode('ス(う)る').digits).toBe('36')
  })

  it('rankey は自動で見つけた中間省略と同じ ! を、記法の位置に置く', () => {
    expect(rankey('さば(ん)な', '387')).toBe(rankey('さばんな', '387'))
    expect(rankey('さば(ん)な', '387')).toBe('AA!A|')
    expect(rankey('り(ん)ご', '615')).toBe('ww!A|')
  })

  it('語尾の ( ) は ! ではなく余りとして表す (3 桁を超えた分と同じ)', () => {
    expect(rankey('にいさ(ん)', '223')).toBe(rankey('にいさん', '223'))
    expect(rankey('にいさ(ん)', '223')).toBe('AAA|n')
    expect(rankey('みっき(ー)', '391')).toBe('BtA|-')
  })

  it('( ) は語尾の ー も囲める', () => {
    expect(new RegExp(KANA_CELL_PATTERN).test('みっき(ー)')).toBe(true)
    expect(stripNotation('みっき(ー)')).toBe('みっきー')
  })

  it('記法があれば自動の探索はしない (書いた読み方を優先する)', () => {
    // さ(ば)んな = 307。番号 387 に合わせて別の 1 文字を飛ばしたりしない
    expect(score('さ(ば)んな').digits).toBe('307')
    expect(rankey('さ(ば)んな', '387')).toBe('A!AA|')
  })
})
