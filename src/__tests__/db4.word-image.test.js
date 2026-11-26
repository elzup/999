// 画像は語に付け、記号ごとに上書きできる (DB 計画 P8)
import { describe, expect, it } from 'vitest'
import { fromLegacy } from '../db4/from-legacy.js'
import { wordImagePlan } from '../db4/word-image.js'
import { toNumberDoc } from '../db4/to-legacy.js'

const slot = (word, imageUrl = '') => ({ word, kana: '', imageUrl })
const numberDoc = (num, slots) => ({ num, hito: '', mono: '', slots })

describe('語の画像', () => {
  it('記号側が空なら語の画像を出し、記号側にあればそちらを出す', () => {
    const { symbols, words } = fromLegacy({
      numbers: [
        numberDoc('106', { wh1: slot('トロ'), wm1: slot('火', 'own') }),
      ],
    })
    const withImage = words.map((w) => ({ ...w, imageUrl: 'shared' }))
    const doc = toNumberDoc(
      symbols[0],
      Object.fromEntries(withImage.map((w) => [w.id, w]))
    )
    expect(doc.slots.wh1.imageUrl).toBe('shared')
    expect(doc.slots.wm1.imageUrl).toBe('own')
  })

  it('記号ごとの画像が 1 種類なら語に載せ、食い違えば保留', () => {
    const { symbols, words } = fromLegacy({
      numbers: [
        numberDoc('106', { wh1: slot('トロ', 'a'), wm1: slot('火', 'x') }),
        numberDoc('206', { wh1: slot('トロ', 'a'), wm1: slot('火', 'y') }),
        numberDoc('306', { wh1: slot('トロ', '') }),
      ],
    })
    const plan = wordImagePlan({ symbols, words })
    const textOf = (id) => words.find((w) => w.id === id).text
    expect(plan.set.map((s) => [textOf(s.wordId), s.imageUrl])).toEqual([
      ['トロ', 'a'],
    ])
    expect(plan.conflicts.map((c) => [textOf(c.wordId), c.images])).toEqual([
      ['火', ['x', 'y']],
    ])
  })
})
