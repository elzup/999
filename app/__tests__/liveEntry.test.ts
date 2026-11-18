import { describe, expect, it } from 'vitest'
import { parseNumberEntry, withNumberEntry } from '../lib/liveEntry'
import type { AppData } from '../data/schema'

const entry = (num: string, w1: string) =>
  parseNumberEntry({ num, w1, w1k: 'あ', wh1: w1, wh1k: 'あ' })!

const dataOf = (...numbers: ReturnType<typeof entry>[]) =>
  ({ numbers, cards: [] }) as unknown as AppData

describe('withNumberEntry', () => {
  it('同じ番号の 1 件だけ差し替える', () => {
    const other = entry('002', 'イ')
    const data = dataOf(entry('001', 'ア'), other)
    const next = withNumberEntry(data, entry('001', 'ウ'))
    expect(next.numbers[0].w1).toBe('ウ')
    expect(next.numbers[1]).toBe(other)
    // 元のデータは書き換えない
    expect(data.numbers[0].w1).toBe('ア')
  })

  it('無い番号・同じ中身なら元のデータを返す (再描画させない)', () => {
    const data = dataOf(entry('001', 'ア'))
    expect(withNumberEntry(data, entry('009', 'ア'))).toBe(data)
    expect(withNumberEntry(data, entry('001', 'ア'))).toBe(data)
  })
})

describe('parseNumberEntry', () => {
  it('形が合わない応答は null', () => {
    expect(parseNumberEntry({ num: 'abc' })).toBeNull()
    expect(parseNumberEntry(undefined)).toBeNull()
  })
})
