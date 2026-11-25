import { describe, expect, it } from 'vitest'
import { planSlotMoves, slotMoveWrites } from '../slot-moves.js'

const w = (word, kana = word) => ({ word, kana, imageUrl: '' })
const doc = (id, slot, hash, extra = {}) => ({
  id,
  slot,
  image: { url: `${hash}.webp`, hash },
  keep: true,
  redo: null,
  candidate: null,
  history: [],
  ...extra,
})
const index = (...docs) =>
  Object.fromEntries(docs.map((d) => [`${d.id}:${d.slot}`, d]))

describe('planSlotMoves', () => {
  it('語を抜いて詰めたら、残った語の画像も詰めた枠へ動かし、空いた枠は空にする', () => {
    const before = { wh1: w('ジェシー'), wh2: w('エクシア') }
    const after = { wh1: w('エクシア') }
    expect(planSlotMoves('282', before, after)).toEqual([
      { to: 'w1', from: { id: '282', slot: 'w1_2' } },
      { to: 'w1_2', from: null },
    ])
  })

  it('入れ替えは互いの画像を入れ替える。動かない語は含めない', () => {
    const before = { wh1: w('a'), wh2: w('b'), wm1: w('c') }
    const after = { wh1: w('b'), wh2: w('a'), wm1: w('c') }
    expect(planSlotMoves('100', before, after)).toEqual([
      { to: 'w1', from: { id: '100', slot: 'w1_2' } },
      { to: 'w1_2', from: { id: '100', slot: 'w1' } },
    ])
  })

  it('別の番号から移ってきた語は、移動元の枠の画像を持ってくる', () => {
    const before = { wh1: w('先客') }
    const after = { wh1: w('先客'), wh2: w('ジェシー') }
    const carry = [{ slot: 'wh2', from: { num: '282', slot: 'wh1' } }]
    expect(planSlotMoves('582', before, after, carry)).toEqual([
      { to: 'w1_2', from: { id: '282', slot: 'w1' } },
    ])
  })

  it('新しく足した語の枠は空にする (前にいた語の画像を付けない)', () => {
    const before = { wh1: w('旧') }
    const after = { wh1: w('新') }
    expect(planSlotMoves('100', before, after)).toEqual([
      { to: 'w1', from: null },
    ])
  })
})

describe('slotMoveWrites', () => {
  it('読んでから書くので入れ替えでも潰さない。タグ違いの枠も一緒に動かす', () => {
    const docs = index(
      doc('100', 'w1', 'A'),
      doc('100', 'w1_2', 'B'),
      doc('100', 'w1_2#res', 'Bres')
    )
    const plan = [
      { to: 'w1', from: { id: '100', slot: 'w1_2' } },
      { to: 'w1_2', from: { id: '100', slot: 'w1' } },
    ]
    const writes = slotMoveWrites('100', plan, docs, 'now')
    const bySlot = Object.fromEntries(
      writes.map((x) => [x.slot, x.doc.image?.hash ?? null])
    )
    expect(bySlot).toEqual({
      w1: 'B',
      'w1#res': 'Bres',
      w1_2: 'A',
      'w1_2#res': null,
    })
    expect(writes.find((x) => x.slot === 'w1').doc).toMatchObject({
      id: '100',
      slot: 'w1',
      keep: true,
      updatedAt: 'now',
    })
  })

  it('空にする枠で文書が元から空なら書かない', () => {
    const docs = index(doc('100', 'w1', 'A', { image: null, keep: false }))
    expect(
      slotMoveWrites('100', [{ to: 'w1', from: null }], docs, 'now')
    ).toEqual([])
  })
})
