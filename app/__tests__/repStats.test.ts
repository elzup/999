import { describe, expect, it } from 'vitest'
import { allCount, repMatrix, setCount } from '../lib/repStats'
import type { NumberDoc } from '../lib/numberApi'

const slots = {
  wh1: { word: 'ア', kana: 'あ' },
  wm1: { word: 'イ', kana: 'い' },
}
const docOf = (num: string, picks: number): NumberDoc => ({
  num,
  slots,
  rep:
    picks === 0
      ? undefined
      : {
          picks: [
            { k: 'あ', w: 'ア' },
            { k: 'い', w: 'イ' },
          ].slice(0, picks),
          confirmed: true,
        },
})

const docs = [
  docOf('123', 2), // ①②
  docOf('124', 1), // ① だけ
  docOf('125', 0),
  docOf('923', 1),
]

describe('repMatrix', () => {
  it('xy は 百×十 に、段階ごとに数える', () => {
    const m = repMatrix(docs, 'xy')
    expect(m.cells[1][2]).toEqual([1, 1, 1])
    expect(m.cells[9][2]).toEqual([0, 1, 0])
    expect(m.rows[1]).toEqual([1, 1, 1])
    expect(m.cols[2]).toEqual([1, 2, 1])
    expect(m.total).toEqual([1, 2, 1])
  })

  it('yz は 十×一 に数える (百の位をまたいで足す)', () => {
    const m = repMatrix(docs, 'yz')
    expect(m.cells[2][3]).toEqual([0, 1, 1])
    expect(m.cells[2][4]).toEqual([0, 1, 0])
    expect(m.cols[3]).toEqual([0, 1, 1])
  })

  it('設定済みは ① だけ + ①②、全体は 3 段階の和', () => {
    const { total } = repMatrix(docs, 'xy')
    expect(setCount(total)).toBe(3)
    expect(allCount(total)).toBe(4)
  })
})
