import { describe, expect, it } from 'vitest'
import {
  BINARY_DIGITS_PER_ROW,
  chunkRows,
  genBinaryRow,
  genBinaryRows,
  scoreBinary,
  scoreBinaryRow,
} from '../lib/binaryTest'

const row = (bit: string) => bit.repeat(BINARY_DIGITS_PER_ROW)

describe('binary row scoring (JMSC 公式ルール)', () => {
  it('満杯30桁・全正解は30ポイント', () => {
    const answer = row('1')
    expect(scoreBinaryRow(answer, answer)).toEqual({
      attempted: 30,
      errors: 0,
      points: 30,
    })
  })

  it('満杯30桁・1ミスは15ポイント', () => {
    const correct = row('1')
    const user = '0' + '1'.repeat(29) // 1桁だけ違う
    expect(scoreBinaryRow(user, correct)).toEqual({
      attempted: 30,
      errors: 1,
      points: 15,
    })
  })

  it('満杯30桁・2ミス以上は0ポイント', () => {
    const correct = row('1')
    const user = '00' + '1'.repeat(28)
    expect(scoreBinaryRow(user, correct)).toEqual({
      attempted: 30,
      errors: 2,
      points: 0,
    })
  })

  it('最終行21桁・全正解は21ポイント', () => {
    const correct = row('1')
    const user = '1'.repeat(21)
    expect(scoreBinaryRow(user, correct)).toEqual({
      attempted: 21,
      errors: 0,
      points: 21,
    })
  })

  it('最終行21桁・1ミスは切り上げで11ポイント (公式例)', () => {
    const correct = row('1')
    const user = '0' + '1'.repeat(20) // 21桁中1ミス
    // 21/2 = 10.5 → 切り上げ 11
    expect(scoreBinaryRow(user, correct)).toEqual({
      attempted: 21,
      errors: 1,
      points: 11,
    })
  })

  it('最終行・2ミス以上は0ポイント', () => {
    const correct = row('1')
    const user = '00' + '1'.repeat(19)
    expect(scoreBinaryRow(user, correct).points).toBe(0)
  })

  it('空行は0ポイント', () => {
    expect(scoreBinaryRow('', row('1'))).toEqual({
      attempted: 0,
      errors: 0,
      points: 0,
    })
  })
})

describe('grid scoring', () => {
  it('全行正解でmaxPointsに達する', () => {
    const correct = genBinaryRows(3)
    const result = scoreBinary(correct, correct)
    expect(result.maxPoints).toBe(90)
    expect(result.points).toBe(90)
    expect(result.rows).toHaveLength(3)
  })

  it('未着手の末尾行は0点として集計される', () => {
    const correct = [row('1'), row('0'), row('1')]
    const user = [row('1')] // 1行だけ回答
    const result = scoreBinary(user, correct)
    expect(result.points).toBe(30)
    expect(result.maxPoints).toBe(90)
    expect(result.rows[1].points).toBe(0)
    expect(result.rows[2].points).toBe(0)
  })

  it('公式例: 2行完答+最終行21桁1ミス = 30+30+11', () => {
    const correct = [row('1'), row('1'), row('1')]
    const user = [row('1'), row('1'), '0' + '1'.repeat(20)]
    const result = scoreBinary(user, correct)
    expect(result.points).toBe(71)
  })
})

describe('chunkRows', () => {
  it('30桁ごとに分割し末尾を途中行にする', () => {
    const entered = '1'.repeat(30) + '0'.repeat(21)
    const rows = chunkRows(entered)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(30)
    expect(rows[1]).toHaveLength(21)
  })

  it('空入力は空配列', () => {
    expect(chunkRows('')).toEqual([])
  })
})

describe('generation', () => {
  it('genBinaryRowは30桁の0/1', () => {
    const r = genBinaryRow()
    expect(r).toHaveLength(30)
    expect(/^[01]{30}$/.test(r)).toBe(true)
  })

  it('genBinaryRowsは指定行数を返す', () => {
    expect(genBinaryRows(5)).toHaveLength(5)
  })
})
