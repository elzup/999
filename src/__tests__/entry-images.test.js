import { describe, expect, it } from 'vitest'
import {
  withEntryImage,
  withLiveTargetWords,
  withSlotImages,
} from '../images/entry-images.js'

describe('withEntryImage', () => {
  it('番号の枠は新旧両方の名前に書く (新しい名前が先に読まれるので)', () => {
    const entry = { num: '531', wh1Img: 'old', w1Img: 'old' }
    expect(withEntryImage(entry, 'w1', 'new')).toEqual({
      num: '531',
      wh1Img: 'new',
      w1Img: 'new',
    })
    expect(withEntryImage(entry, 'w2_2', 'x')).toMatchObject({
      wm2Img: 'x',
      w2_2Img: 'x',
    })
  })

  it('タグ違いの枠はタグの画像に、カードの枠はカードの画像に書く', () => {
    expect(withEntryImage({ wh2TagImg: { a: 'A' } }, 'w1_2#res', 'R')).toEqual({
      wh2TagImg: { a: 'A', res: 'R' },
    })
    expect(withEntryImage({}, 'P', 'p')).toEqual({ personImg: 'p' })
  })

  it('知らない枠・同じ画像ならそのまま (同じ物を返す)', () => {
    const entry = { wh1Img: 'u', w1Img: 'u' }
    expect(withEntryImage(entry, 'zz', 'x')).toBe(entry)
    expect(withEntryImage(entry, 'w1', 'u')).toBe(entry)
  })
})

describe('withSlotImages', () => {
  it('正本の画像を番号・日付・カードに重ねる', () => {
    const data = {
      numbers: [{ num: '531', wh1Img: 'old', w1Img: 'old' }, { num: '532' }],
      dates: [{ num: '0101' }],
      cards: [{ rank: 'A', suit: 'S' }],
      other: 1,
    }
    const out = withSlotImages(data, {
      '531:w1': { image: { url: 'n' } },
      '0101:w2': { image: { url: 'd' } },
      'AS:O': { image: { url: 'c' } },
      '532:w1': { keep: true },
    })
    expect(out.numbers[0]).toMatchObject({ wh1Img: 'n', w1Img: 'n' })
    expect(out.numbers[1]).toBe(data.numbers[1])
    expect(out.dates[0]).toMatchObject({ wm1Img: 'd' })
    expect(out.cards[0]).toMatchObject({ objectImg: 'c' })
    expect(out.other).toBe(1)
  })
})

describe('withLiveTargetWords', () => {
  it('番号の対象の語を番号文書の最新の語にする', () => {
    const state = {
      targets: [
        { id: '531', kind: 'num', w1: '古い', w2: '物' },
        { id: '532', kind: 'num', w1: 'そのまま' },
        { id: '0101', kind: 'date', w1: '日付' },
      ],
    }
    const out = withLiveTargetWords(state, {
      531: { slots: { wh1: { word: 'コミー#tri' }, wm1: { word: '物' } } },
      '0101': { slots: { wh1: { word: '別' } } },
    })
    expect(out.targets[0]).toMatchObject({
      w1: 'コミー#tri',
      w2: '物',
      w1_2: '',
    })
    expect(out.targets[1]).toBe(state.targets[1])
    expect(out.targets[2]).toBe(state.targets[2])
  })
})
