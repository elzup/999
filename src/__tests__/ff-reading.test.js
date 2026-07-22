import { describe, expect, it } from 'vitest'
import {
  buildRow,
  hexNameRead,
  parenInner,
  rowReading,
  stripTags,
  validateFfRows,
} from '../ff-reading.js'

const validRows = Array.from({ length: 256 }, (_, value) => [
  String(value),
  value.toString(16).toUpperCase().padStart(2, '0'),
  ['NN', 'NC', 'CN', 'CC'][value % 4],
  value.toString(2).padStart(8, '0'),
  String(value),
  `語${value}（ご${value}）`,
  '',
  '',
])

describe('FF reading rules', () => {
  it('REQ-FF-001: reads both hex digits by name', () => {
    expect(hexNameRead('B3')).toBe('びーさん')
    expect(hexNameRead('0F')).toBe('ぜろえふ')
  })

  it('uses the last full-width parenthesized reading', () => {
    expect(parenInner('語（注記）（かな）')).toBe('かな')
  })

  it('normalizes trailing tags without deleting the base word', () => {
    expect(stripTags('ラビ #lom -a |')).toBe('ラビ')
  })

  it('design:ff-data: shares deterministic NC/CN and NN/CC rules', () => {
    expect(rowReading(['179', 'B3', 'NC', '', '', 'イーサ（いいさ）'])).toBe(
      'びーさんいいさ'
    )
    expect(rowReading(['10', '0A', 'NN', '', '', '鶏（にわとり）'])).toBe(
      'にわとり'
    )
    expect(rowReading(['255', 'FF', 'CC', '', '', '', 'フフ', ''])).toBe('フフ')
  })

  it('builds the app row from the same reading rules', () => {
    expect(
      buildRow(['179', 'B3', 'NC', '10110011', '113', 'イーサ（いいさ）'])
    ).toEqual({
      hex: 'B3',
      type: 'NC',
      bin: '10110011',
      exp: '113',
      word: 'イーサ',
      kana: 'いいさ',
      read: 'びーさんいいさ',
    })
  })

  it('REQ-FF-001: accepts exactly one ordered row for each 00-FF value', () => {
    expect(validateFfRows(validRows)).toBe(validRows)
  })

  it.each([
    ['missing row', validRows.slice(0, -1)],
    [
      'duplicate hex',
      validRows.map((row, i) => (i === 1 ? validRows[0] : row)),
    ],
    [
      'invalid binary',
      validRows.map((row, i) => (i === 10 ? row.with(3, '00000000') : row)),
    ],
    [
      'invalid type',
      validRows.map((row, i) => (i === 10 ? row.with(2, 'XX') : row)),
    ],
  ])('REQ-FF-001: rejects %s', (_label, rows) => {
    expect(() => validateFfRows(rows)).toThrow(/FF source/)
  })
})
