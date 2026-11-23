// 編集画面のタグ違いカード (D-0133): 枠は 1 つのまま、カードは出典タグごとに分け、
// 語欄は本体だけを書き換え、代表・評価はタグ 1 つの語に付く
import { describe, expect, it } from 'vitest'
import type { NumberDoc } from '../lib/numberApi'
import {
  carryOverOps,
  setRepPick,
  slotRows,
  splitRows,
} from '../lib/numberDetail'
import { baseText, removeTag, setBase } from '../lib/wordTags'

const doc: NumberDoc = {
  num: '339',
  slots: {
    wh1: {
      word: '美咲#bang#ml',
      kana: 'みさき',
      tagImages: { bang: 'b.webp', ml: 'm.webp' },
    },
    wh2: { word: 'ミサ', kana: 'みさ' },
  },
  rep: { picks: [{ k: 'みさき', w: '美咲#ml' }], confirmed: true },
  ratings: [{ k: 'みさき', w: '美咲#bang', v: 2 }],
}

describe('語欄は本体だけ (baseText / setBase)', () => {
  it('タグとラベルの手前までを本体として出す', () => {
    expect(baseText('美咲#bang#ml')).toBe('美咲')
    expect(baseText('フェイ#shingeki#doruw -n')).toBe('フェイ')
    expect(baseText('語 -n')).toBe('語')
    expect(baseText('鯉(魚)#g')).toBe('鯉(魚)')
    expect(baseText('#a')).toBe('')
    expect(baseText('タグなし')).toBe('タグなし')
  })

  it('本体を書き換えてもタグ・ラベルは元のまま残す', () => {
    expect(setBase('美咲#bang#ml', 'みさき')).toBe('みさき#bang#ml')
    expect(setBase('語 -n', '語句')).toBe('語句 -n')
    expect(setBase('タグなし', 'あ')).toBe('あ')
  })

  it('欄で # を打ってもタグにならない', () => {
    expect(setBase('美咲#bang', '美咲#ml')).toBe('美咲ml#bang')
  })
})

describe('編集中の行もタグごとのカードに分ける (splitRows)', () => {
  it('保存済みの枠を出典タグごとに分け、評価・代表・画像はタグの語で引く', () => {
    const cards = splitRows(slotRows(doc), doc)
    expect(cards.map((c) => [c.key, c.word])).toEqual([
      ['wh1#bang', '美咲#bang'],
      ['wh1#ml', '美咲#ml'],
      ['wh2', 'ミサ'],
    ])
    expect(cards[0]).toMatchObject({
      rating: 2,
      repRank: 0,
      imageUrl: 'b.webp',
    })
    expect(cards[1]).toMatchObject({
      rating: null,
      repRank: 1,
      imageUrl: 'm.webp',
    })
  })

  it('下書きで足したタグもその場でカードになる', () => {
    const draft = slotRows(doc).map((row) =>
      row.slot === 'wh2' ? { ...row, word: 'ミサ#a#b' } : row
    )
    expect(splitRows(draft, doc).map((c) => c.key)).toEqual([
      'wh1#bang',
      'wh1#ml',
      'wh2#a',
      'wh2#b',
    ])
  })

  it('タグのカードを消すと、そのタグだけ外れて残りは 1 枚のカードに戻る', () => {
    expect(removeTag('美咲#bang#ml', 'bang')).toBe('美咲#ml')
    const after = slotRows({
      ...doc,
      slots: { ...doc.slots, wh1: { word: '美咲#ml', kana: 'みさき' } },
    })
    expect(splitRows(after, doc).map((c) => c.key)).toEqual(['wh1', 'wh2'])
  })
})

describe('タグ違いのカードの代表と引き継ぎ', () => {
  it('代表はタグ 1 つの語で付く', () => {
    expect(setRepPick(doc, 'wh1', 2, '美咲#bang')).toEqual([
      { k: 'みさき', w: '美咲#ml' },
      { k: 'みさき', w: '美咲#bang' },
    ])
  })

  it('枠にラベルを足すと、タグ違いの語の代表・評価も付け直す', () => {
    const ops = carryOverOps(doc, [
      { slot: 'wh1', word: '美咲#bang#ml -n', kana: 'みさき' },
      { slot: 'wh2', word: 'ミサ', kana: 'みさ' },
    ])
    expect(ops).toEqual([
      {
        op: 'rep',
        picks: [{ k: 'みさき', w: '美咲#ml -n' }],
        confirmed: true,
      },
      { op: 'rating', k: 'みさき', w: '美咲#bang -n', v: 2 },
    ])
  })
})
