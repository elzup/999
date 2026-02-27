import { describe, it, expect } from 'vitest'
import { decode, getKanaForDigit, getReverseTable } from '../decoder.js'

describe('getKanaForDigit', () => {
  it('1桁の逆引き', () => {
    expect(getKanaForDigit('0')).toContain('れ')
    expect(getKanaForDigit('0')).toContain('お')
    expect(getKanaForDigit('9')).toContain('き')
  })

  it('2桁の逆引き', () => {
    expect(getKanaForDigit('00')).toContain('ま')
    expect(getKanaForDigit('98')).toContain('きゃ')
    expect(getKanaForDigit('64')).toContain('りょ')
    expect(getKanaForDigit('64')).toContain('じょ')
  })

  it('存在しない数字は空配列', () => {
    expect(getKanaForDigit('02')).toEqual([])
  })
})

describe('getReverseTable', () => {
  it('全1桁キーが存在する', () => {
    const table = getReverseTable()
    for (let i = 0; i <= 9; i++) {
      expect(table[String(i)]).toBeDefined()
      expect(table[String(i)].length).toBeGreaterThan(0)
    }
  })
})

describe('decode', () => {
  it('3桁数字を分割候補に展開', () => {
    const results = decode('901')
    const split111 = results.find(
      (r) => r.parts.length === 3 && r.parts.join(',') === '9,0,1'
    )
    expect(split111).toBeDefined()
    expect(split111.kanaOptions[0]).toContain('き')
    expect(split111.kanaOptions[1]).toContain('れ')
    expect(split111.kanaOptions[2]).toContain('い')
  })

  it('2桁+1桁の分割も含む', () => {
    const results = decode('989')
    const split21 = results.find(
      (r) => r.parts.length === 2 && r.parts[0] === '98'
    )
    expect(split21).toBeDefined()
    expect(split21.kanaOptions[0]).toContain('きゃ')
  })
})
