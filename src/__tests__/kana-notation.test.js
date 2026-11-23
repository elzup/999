import { describe, expect, it } from 'vitest'
import {
  KANA_CELL_PATTERN,
  hasNotation,
  parseNotation,
  readPart,
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
    expect(re.test('さばﾝな')).toBe(true)
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

describe('記法 半角カナ (読まないかな)', () => {
  it('地のかなと読まない区間に分け、記号を外すとかなは残る', () => {
    expect(parseNotation('さばﾝな')).toEqual([
      { text: 'さば', hira: 'さば', half: false, skip: false },
      { text: 'ﾝ', hira: 'ん', half: false, skip: true },
      { text: 'な', hira: 'な', half: false, skip: false },
    ])
    expect(stripNotation('さばﾝな')).toBe('さばんな')
    expect(stripNotation('スｳる')).toBe('すうる')
    expect(hasNotation('さばﾝな')).toBe(true)
  })

  it('続けて書いた半角カナは 1 つの読まない区間、濁点もひらがなに戻す', () => {
    expect(parseNotation('きすﾏｰｸ')[1]).toEqual({
      text: 'ﾏｰｸ',
      hira: 'まーく',
      half: false,
      skip: true,
    })
    expect(stripNotation('りﾝｺﾞ')).toBe('りんご')
    expect(readPart('さばﾝな')).toBe('さばな')
  })

  it('括弧・英数字があるよみは読めない (旧記法 (ん) [す] は廃止)', () => {
    expect(() => parseNotation('さば(ん)な')).toThrow()
    expect(() => parseNotation('さば(んな')).toThrow()
    expect(() => parseNotation('[す]うる')).toThrow()
    expect(() => parseNotation('さばxな')).toThrow()
  })

  it('半角カナは数字にしない', () => {
    expect(encode('さばﾝな').digits).toBe('387')
    expect(encode('りﾝご').digits).toBe('615')
    // 1 桁読みと一緒に使える
    expect(encode('スｳる').digits).toBe('36')
  })

  it('rankey は記法の位置に ! を置く。記法の無いよみには付けない (D-0118)', () => {
    expect(rankey('さばﾝな', '387')).toBe('AA!A|')
    // 記法が無ければ書いたとおりに読む (ん=0、な は余り)
    expect(rankey('さばんな', '387')).toBe('AAA|.')
    expect(rankey('りﾝご', '615')).toBe('ww!A|')
  })

  it('語尾の ( ) は ! ではなく余りとして表す (3 桁を超えた分と同じ)', () => {
    expect(rankey('にいさﾝ', '223')).toBe(rankey('にいさん', '223'))
    expect(rankey('にいさﾝ', '223')).toBe('AAA|n')
    expect(rankey('みっきｰ', '391')).toBe('BtA|-')
  })

  it('( ) は語尾の ー も囲める', () => {
    expect(new RegExp(KANA_CELL_PATTERN).test('みっきｰ')).toBe(true)
    expect(stripNotation('みっきｰ')).toBe('みっきー')
  })

  it('記法があれば自動の探索はしない (書いた読み方を優先する)', () => {
    // さﾊﾞんな = 307。番号 387 に合わせて別の 1 文字を飛ばしたりしない
    expect(score('さﾊﾞんな').digits).toBe('307')
    expect(rankey('さﾊﾞんな', '387')).toBe('A!AA|')
  })
})

describe('記法 語尾 (+ の後ろ、D-0122)', () => {
  it('+ の後ろは数字にしない', () => {
    expect(encode('ひふみ+ん').digits).toBe('123')
    expect(encode('とま+す').digits).toBe('1000')
  })

  it('促音の直後が語尾なら、促音は語尾の頭の数字を写す', () => {
    // ヒッチ: ひ=1、っ は ち (22) を写す。ち そのものは語尾
    expect(encode('ひっ+ち').digits).toBe(encode('ひっち').digits.slice(0, 3))
  })

  it('rankey は語尾を余りにし、語は見ない', () => {
    expect(rankey('ひふみ+ん', '123', '')).toBe('BBB|n')
    expect(rankey('どび+ー', '101', 'ドビー')).toBe('wwB|-')
    expect(rankey('とに+ーち', '102', 'トニーチョッパー')).toBe('wwA|..')
    expect(rankey('とま+す', '100', '')).toBe('wwv|v.')
  })

  it('語尾はひらがな 2 文字まで、+ は最後に 1 つだけ', () => {
    expect(() => encode('とに+ーちょ')).toThrow()
    expect(() => encode('と+に+ん')).toThrow()
    expect(() => encode('とに+ス')).toThrow()
    const cell = new RegExp(KANA_CELL_PATTERN)
    expect(cell.test('ひふみ+ん')).toBe(true)
    expect(cell.test('ぶろｯこ+りー')).toBe(true)
    expect(cell.test('とに+ーちょ')).toBe(false)
  })

  it('stripNotation は + を外して語尾も残す / readPart は語尾を落とす', () => {
    expect(stripNotation('ひふみ+ん')).toBe('ひふみん')
    expect(readPart('ひふみ+ん')).toBe('ひふみ')
  })
})
