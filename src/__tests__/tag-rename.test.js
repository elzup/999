import { describe, expect, it } from 'vitest'
import {
  columnName,
  isValidTagName,
  renameTagInDoc,
  renameTagInSheet,
  renameTagInText,
} from '../tag-rename.js'

describe('renameTagInText', () => {
  it('タグの区切りまでを 1 つのタグとして置き換える', () => {
    expect(renameTagInText('イカ#スプラ', 'スプラ', 'splatoon')).toBe(
      'イカ#splatoon'
    )
    // 前方一致の別タグ (#スプラ2) は触らない
    expect(
      renameTagInText('イカ#スプラ2#スプラ -n', 'スプラ', 'splatoon')
    ).toBe('イカ#スプラ2#splatoon -n')
  })

  it('セル (カンマ区切り) の中の各語に効く', () => {
    expect(renameTagInText('マオ#ｼｬﾆ,レイ#pr,ユイ#ｼｬﾆ#g', 'ｼｬﾆ', 'shani')).toBe(
      'マオ#shani,レイ#pr,ユイ#shani#g'
    )
  })

  it('同じ語に新しい名前が既にあれば古い方を消すだけ', () => {
    expect(renameTagInText('リコ#a#b -n', 'a', 'b')).toBe('リコ#b -n')
  })

  it('該当が無ければそのまま', () => {
    expect(renameTagInText('ハブ#ｳｼｼﾞﾏ', 'res', 'x')).toBe('ハブ#ｳｼｼﾞﾏ')
    expect(renameTagInText(undefined, 'res', 'x')).toBe('')
  })
})

describe('renameTagInDoc', () => {
  const doc = {
    num: '900',
    hito: 'クマ,カレン#res#ｺｰﾄﾞｷﾞｱｽ',
    mono: '',
    gainen: '',
    slots: {
      wh1: { word: 'クマ', kana: 'くま', imageUrl: '' },
      wh2: {
        word: 'カレン#res#ｺｰﾄﾞｷﾞｱｽ',
        kana: 'かれん',
        imageUrl: 'u0',
        confirmedFor: 'カレン#res',
        tagImages: { res: 'u1', ｺｰﾄﾞｷﾞｱｽ: 'u2' },
      },
    },
    rep: {
      picks: [
        { k: 'かれん', w: 'カレン#res' },
        { k: 'くま', w: 'クマ' },
      ],
      confirmed: true,
    },
    ratings: [{ k: 'かれん', w: 'カレン#res', v: 2 }],
    updatedAt: 't',
    source: 'sheet',
  }

  it('一覧・語・確定時の語・タグ別の画像・代表・評価をまとめて置き換える', () => {
    const next = renameTagInDoc(doc, 'res', 'atelier')
    expect(next.hito).toBe('クマ,カレン#atelier#ｺｰﾄﾞｷﾞｱｽ')
    expect(next.slots.wh2).toEqual({
      word: 'カレン#atelier#ｺｰﾄﾞｷﾞｱｽ',
      kana: 'かれん',
      imageUrl: 'u0',
      confirmedFor: 'カレン#atelier',
      tagImages: { ｺｰﾄﾞｷﾞｱｽ: 'u2', atelier: 'u1' },
    })
    expect(next.rep.picks[0]).toEqual({ k: 'かれん', w: 'カレン#atelier' })
    expect(next.ratings[0].w).toBe('カレン#atelier')
    expect(next.slots.wh1).toEqual(doc.slots.wh1)
  })

  it('新しい名前の画像が既にあれば上書きしない', () => {
    const next = renameTagInDoc(doc, 'res', 'ｺｰﾄﾞｷﾞｱｽ')
    expect(next.slots.wh2.tagImages).toEqual({ ｺｰﾄﾞｷﾞｱｽ: 'u2' })
    expect(next.slots.wh2.word).toBe('カレン#ｺｰﾄﾞｷﾞｱｽ')
  })

  it('置き換えで同じ値になった代表は 1 つにまとめる', () => {
    const twin = {
      ...doc,
      rep: {
        picks: [
          { k: 'かれん', w: 'カレン#a' },
          { k: 'かれん', w: 'カレン#b' },
        ],
        confirmed: false,
      },
    }
    expect(renameTagInDoc(twin, 'a', 'b').rep.picks).toEqual([
      { k: 'かれん', w: 'カレン#b' },
    ])
  })

  it('変わらなければ null', () => {
    expect(renameTagInDoc(doc, 'nothing', 'x')).toBe(null)
  })
})

describe('renameTagInSheet', () => {
  it('人 / 物 の列だけを見て、変わるセルを A1 表記で返す', () => {
    const values = [
      ['num', '人', '物', 'ng', '_', 'wh1'],
      ['900', 'クマ,カレン#res', '紅蓮#res', 'FALSE', '', 'カレン#res'],
      ['901', 'ナシ', '', 'FALSE'],
    ]
    expect(renameTagInSheet(values, 'res', 'atelier')).toEqual([
      { cell: 'B2', before: 'クマ,カレン#res', after: 'クマ,カレン#atelier' },
      { cell: 'C2', before: '紅蓮#res', after: '紅蓮#atelier' },
    ])
  })
})

describe('helpers', () => {
  it('columnName', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
    ])
  })

  it('isValidTagName', () => {
    expect(isValidTagName('splatoon')).toBe(true)
    expect(isValidTagName('a b')).toBe(false)
    expect(isValidTagName('#a')).toBe(false)
    expect(isValidTagName('')).toBe(false)
  })
})
