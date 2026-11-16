import { describe, expect, it } from 'vitest'
import { markDoc, overlayMarks } from '../images/marks.js'

const NOW = '2026-11-16T00:00:00.000Z'

describe('overlayMarks', () => {
  const base = {
    keep: { '001:w1': true },
    redo: { '002:w2': { flaggedAt: 'old', reason: '' } },
  }

  it('印の無い枠は手元の値のまま', () => {
    expect(overlayMarks(base, [])).toEqual(base)
  })

  it('web で付けたロックと外したロックを重ねる', () => {
    const next = overlayMarks(base, [
      { id: '001', slot: 'w1', keep: false },
      { id: '003', slot: 'w1_2#res', keep: true },
    ])
    expect(next.keep).toEqual({ '003:w1_2#res': true })
  })

  it('redo: false は手元の撮り直しの印を消す', () => {
    const next = overlayMarks(base, [{ id: '002', slot: 'w2', redo: false }])
    expect(next.redo).toEqual({})
  })

  it('keep だけの印は redo に触らない', () => {
    const next = overlayMarks(base, [{ id: '002', slot: 'w2', keep: true }])
    expect(next.redo).toEqual(base.redo)
  })

  it('入力を書き換えない', () => {
    const copy = structuredClone(base)
    overlayMarks(base, [{ id: '001', slot: 'w1', keep: false }])
    expect(base).toEqual(copy)
  })
})

describe('markDoc', () => {
  it('keep の印', () => {
    expect(
      markDoc({ id: '001', slot: 'w1', op: 'keep', on: true, now: NOW })
    ).toEqual({ id: '001', slot: 'w1', at: NOW, keep: true })
  })

  it('redo を外すと false (欄が無いのと区別する)', () => {
    expect(
      markDoc({ id: '001', slot: 'w1', op: 'redo', on: false, now: NOW }).redo
    ).toBe(false)
  })
})
