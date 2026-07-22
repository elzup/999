import { describe, it, expect } from 'vitest'
import { NumberEntrySchema, type NumberEntry } from '../data/schema'
import { makeRng } from '../lib/kukuQuiz'
import {
  toHex,
  toBin,
  formatByte,
  parseCode,
  byteToNibbles,
  nibblesToByte,
  twoByTwoDistractors,
  hexPool,
  buildHexQuestion,
  buildHexQuiz,
} from '../lib/hexQuiz'

const entry = (num: string, wh1: string): NumberEntry =>
  NumberEntrySchema.parse({ num, wh1 })

// 0-255 の一部に語を持たせる (256=語なしで範囲外, 300=範囲外)
const ENTRIES: NumberEntry[] = [
  entry('000', 'まる'),
  entry('001', 'おうい'),
  entry('015', 'いちご'),
  entry('171', 'あいひる'), // 0xAB
  entry('200', 'にんじゃ'),
  entry('255', 'ふふご'), // 0xFF
  entry('256', 'はんい'), // 範囲外 (byte>255)
  entry('300', 'みま'), // 範囲外
  entry('100', ''), // 語なし → 除外
]

describe('toHex / toBin / formatByte', () => {
  it('2桁大文字16進 / 8桁2進', () => {
    expect(toHex(171)).toBe('AB')
    expect(toHex(0)).toBe('00')
    expect(toHex(255)).toBe('FF')
    expect(toBin(171)).toBe('10101011')
    expect(toBin(0)).toBe('00000000')
    expect(formatByte(171, 'hex')).toBe('AB')
    expect(formatByte(171, 'bin')).toBe('10101011')
  })
})

describe('parseCode', () => {
  it('表記に応じてバイトへ戻す', () => {
    expect(parseCode('AB', 'hex')).toBe(171)
    expect(parseCode('10101011', 'bin')).toBe(171)
    expect(parseCode('FF', 'hex')).toBe(255)
  })
  it('壊れた入力は null', () => {
    expect(parseCode('', 'hex')).toBe(null)
    expect(parseCode('ZZ', 'hex')).toBe(null)
  })
})

describe('byteToNibbles / nibblesToByte', () => {
  it('往復する', () => {
    for (const b of [0, 1, 15, 16, 171, 255]) {
      const [hi, lo] = byteToNibbles(b)
      expect(nibblesToByte(hi, lo)).toBe(b)
    }
    expect(byteToNibbles(171)).toEqual([10, 11]) // A, B
  })
})

describe('twoByTwoDistractors', () => {
  it("正解を含む4バイトが {hi,hi'}×{lo,lo'} の格子になる", () => {
    const answer = 0xab // 171
    const [hi, lo] = byteToNibbles(answer)
    const ds = twoByTwoDistractors(answer, makeRng(7))
    const all = [answer, ...ds]

    // 4つとも相異なる
    expect(new Set(all).size).toBe(4)

    // 出現するニブルは各桁ちょうど2種類
    const his = new Set(all.map((b) => byteToNibbles(b)[0]))
    const los = new Set(all.map((b) => byteToNibbles(b)[1]))
    expect(his.size).toBe(2)
    expect(los.size).toBe(2)
    expect(his.has(hi)).toBe(true)
    expect(los.has(lo)).toBe(true)

    // 各桁の値は 4択中ちょうど2回ずつ → 1桁だけでは絞り込めない
    for (const hv of his) {
      expect(all.filter((b) => byteToNibbles(b)[0] === hv)).toHaveLength(2)
    }
    for (const lv of los) {
      expect(all.filter((b) => byteToNibbles(b)[1] === lv)).toHaveLength(2)
    }
  })

  it('誤答はどれも正解と異なる', () => {
    for (const seed of [1, 2, 3, 42, 100]) {
      const answer = 0x3c
      const ds = twoByTwoDistractors(answer, makeRng(seed))
      expect(ds).not.toContain(answer)
      expect(new Set(ds).size).toBe(3)
    }
  })
})

describe('hexPool', () => {
  it('0-255 かつ語ありのバイトだけを byte→語 に落とす', () => {
    const pool = hexPool(ENTRIES)
    const bytes = pool.map((p) => p.byte)
    expect(bytes).toContain(0)
    expect(bytes).toContain(171)
    expect(bytes).toContain(255)
    expect(bytes).not.toContain(256) // 範囲外
    expect(bytes).not.toContain(300) // 範囲外
    expect(bytes).not.toContain(100) // 語なし
    // 昇順
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b))
    const ab = pool.find((p) => p.byte === 171)!
    expect(ab).toEqual({ byte: 171, num: '171', word: 'あいひる' })
  })
})

describe('buildHexQuestion', () => {
  it('toCode: prompt は語、answer はコード、選択肢は 2×2', () => {
    const pool = hexPool(ENTRIES)
    const item = pool.find((p) => p.byte === 171)!
    const q = buildHexQuestion(item, pool, makeRng(5), {
      notation: 'hex',
      direction: 'toCode',
    })
    expect(q.prompt).toBe('あいひる')
    expect(q.answer).toBe('AB')
    expect(q.choices).toHaveLength(4)
    expect(q.choices).toContain('AB')
    expect(new Set(q.choices).size).toBe(4)
    expect(q.bmKey).toBe('n:171')

    // 各桁ちょうど2種類 (絞り込み不可) — hex 文字列で検証
    const firsts = new Set(q.choices.map((c) => c[0]))
    const seconds = new Set(q.choices.map((c) => c[1]))
    expect(firsts.size).toBe(2)
    expect(seconds.size).toBe(2)
  })

  it('toCode + bin: 選択肢は8桁2進で正解を含む', () => {
    const pool = hexPool(ENTRIES)
    const item = pool.find((p) => p.byte === 171)!
    const q = buildHexQuestion(item, pool, makeRng(5), {
      notation: 'bin',
      direction: 'toCode',
    })
    expect(q.answer).toBe('10101011')
    expect(q.choices).toContain('10101011')
    for (const c of q.choices) expect(c).toMatch(/^[01]{8}$/)
  })

  it('toWord: prompt はコード、answer は語、誤答は他の語', () => {
    const pool = hexPool(ENTRIES)
    const item = pool.find((p) => p.byte === 171)!
    const q = buildHexQuestion(item, pool, makeRng(5), {
      notation: 'hex',
      direction: 'toWord',
    })
    expect(q.prompt).toBe('AB')
    expect(q.answer).toBe('あいひる')
    expect(q.choices).toContain('あいひる')
    expect(q.choices).not.toContain('AB')
    expect(q.bmKey).toBe('n:171')
  })
})

describe('buildHexQuiz', () => {
  it('count 問を作り、各設問の正解は choices に含まれる', () => {
    const pool = hexPool(ENTRIES)
    const quiz = buildHexQuiz(pool, 4, makeRng(9))
    expect(quiz).toHaveLength(4)
    for (const q of quiz) expect(q.choices).toContain(q.answer)
  })

  it('pool 数を超える count はクランプされる', () => {
    const pool = hexPool(ENTRIES)
    const quiz = buildHexQuiz(pool, 100, makeRng(2))
    expect(quiz).toHaveLength(pool.length)
  })

  it('同じ seed なら決定的', () => {
    const pool = hexPool(ENTRIES)
    expect(buildHexQuiz(pool, 3, makeRng(5))).toEqual(
      buildHexQuiz(pool, 3, makeRng(5))
    )
  })
})
