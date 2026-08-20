import { describe, expect, it } from 'vitest'
import { computeDerived, withDerived } from '../firestore/derived.js'

const doc = {
  num: '051',
  slots: {
    wh1: { word: '鯉', kana: 'こい', imageUrl: '' },
    wm1: { word: 'コイン', kana: 'こいん', imageUrl: '' },
  },
  updatedAt: '2026-08-20T00:00:00.000Z',
  source: 'sheet',
}

describe('derived values', () => {
  it('REQ-DRV-001: computes pt and rankey for every filled slot', () => {
    const derived = computeDerived(doc)

    expect(Object.keys(derived.ptBySlot).sort()).toEqual(['wh1', 'wm1'])
    // こい = こ(5)+い(1) の2桁。051 に対しては先頭0が省略されるので _AA|
    expect(derived.rankeyBySlot.wh1).toBe('_AA|')
    expect(derived.rankeyBySlot.wm1).toBe('AAA|')
    expect(typeof derived.ptBySlot.wh1).toBe('number')
  })

  it('is a pure function of slots — same input, same output', () => {
    expect(computeDerived(doc)).toEqual(
      computeDerived({ ...doc, source: 'app' })
    )
  })

  it('REQ-DRV-004: leaves a slot out when its kana is empty', () => {
    const empty = {
      ...doc,
      slots: { ...doc.slots, wm1: { word: 'コイン', kana: '', imageUrl: '' } },
    }
    const derived = computeDerived(empty)

    expect('wm1' in derived.ptBySlot).toBe(false)
    expect('wm1' in derived.rankeyBySlot).toBe(false)
  })

  it('REQ-DRV-005: records null for unencodable kana but still succeeds', () => {
    const broken = {
      ...doc,
      slots: { wh1: { word: 'ゑゐ', kana: 'ゑゐ', imageUrl: '' } },
    }
    const derived = computeDerived(broken)

    expect(derived.ptBySlot.wh1).toBe(null)
    expect(derived.rankeyBySlot.wh1).toBe(null)
  })

  it('withDerived attaches derived without touching the rest', () => {
    const next = withDerived(doc)

    expect(next.derived).toEqual(computeDerived(doc))
    expect(next.slots).toBe(doc.slots)
    expect(next.source).toBe('sheet')
  })

  it('withDerived replaces any derived the caller supplied', () => {
    const next = withDerived({ ...doc, derived: { ptBySlot: { wh1: 999 } } })

    expect(next.derived.ptBySlot.wh1).not.toBe(999)
  })

  it('rankey reflects the number, not just the kana', () => {
    // 同じかな «ひっち» でも num によって結果が変わる。num を無視する実装なら
    // どちらか一方が必ず外れる (以前のテストは num を消しても通る無意味なものだった)
    const at122 = {
      num: '122',
      slots: { wh1: { word: 'X', kana: 'ひっち', imageUrl: '' } },
    }
    const at221 = {
      num: '221',
      slots: { wh1: { word: 'X', kana: 'ひっち', imageUrl: '' } },
    }

    expect(computeDerived(at122).rankeyBySlot.wh1).not.toBe(
      computeDerived(at221).rankeyBySlot.wh1
    )
  })

  it('REQ-DRV-006: refuses to compute without a three-digit num', () => {
    // num 無しで計算させると ~1% の語で «もっともらしいが誤った» rankey が入る
    expect(() => computeDerived({ slots: {} })).toThrow(/3-digit num/)
    expect(() => computeDerived({ num: '12', slots: {} })).toThrow(
      /3-digit num/
    )
  })
})
