import { describe, expect, it } from 'vitest'
import { rankeyOf } from '../lib/rankey'

describe('rankeyOf (D-0045: アプリがその場で計算する)', () => {
  it('かな・番号から内訳記法を出す', () => {
    // こい = こ(5)+い(1) の 2 桁。051 では先頭 0 が省略されるので _AA|
    expect(rankeyOf('こい', '051', '鯉')).toBe('_AA|')
  })

  it('よみの記法だけで決まり、番号に合わせて読み方を探さない (D-0118)', () => {
    // 以前は番号に合うよう 1 字飛ばす所を探していた (ひっち 122 → B!ww)
    expect(rankeyOf('ひっち', '122', 'X')).toBe(rankeyOf('ひっち', '221', 'X'))
    expect(rankeyOf('ひｯち', '122', 'X')).toBe('B!ww|')
  })

  it('かなが空なら出さない', () => {
    expect(rankeyOf('', '051')).toBeUndefined()
    expect(rankeyOf('  ', '051')).toBeUndefined()
    expect(rankeyOf(undefined, '051')).toBeUndefined()
  })

  it('規則表で読めないかなは出さない', () => {
    expect(rankeyOf('ゑゐ', '051')).toBeUndefined()
  })
})
