import { describe, expect, it } from 'vitest'
import { assembleNumberDoc, mergeVariants } from '../firestore/v2-assemble.js'

const word = (over) => ({
  side: 'hito',
  base: '',
  slot: '',
  kana: '',
  tags: [],
  labels: [],
  ...over,
})

describe('mergeVariants', () => {
  it('同じ item の語 (出典タグで分けた語) を 1 項目に戻す', () => {
    const merged = mergeVariants([
      word({ seq: 1, item: 0, base: '黄泉', text: '黄泉#ｽﾀﾚ' }),
      word({ seq: 2, item: 0, base: '黄泉', text: '黄泉#tri' }),
    ])
    expect(merged.map((w) => w.raw)).toEqual(['黄泉#ｽﾀﾚ#tri'])
  })

  it('別の item なら、同じ本体でも別の項目のまま (613 の リサ#genshin, リサ#bang)', () => {
    const merged = mergeVariants([
      word({ seq: 1, item: 1, base: 'リサ', text: 'リサ#genshin' }),
      word({ seq: 2, item: 2, base: 'リサ', text: 'リサ#bang' }),
    ])
    expect(merged.map((w) => w.raw)).toEqual(['リサ#genshin', 'リサ#bang'])
  })
})

describe('assembleNumberDoc', () => {
  it('空の項目の位置を残す (288 の ニッパー,茶葉,,庭#g)', () => {
    const doc = assembleNumberDoc('288', {
      words: [
        word({ seq: 1, item: 0, side: 'mono', text: 'ニッパー', slot: 'wm1' }),
        word({ seq: 2, item: 1, side: 'mono', text: '茶葉', slot: 'wm2' }),
        word({ seq: 3, item: 3, side: 'mono', text: '庭#g' }),
      ],
      head: { repPicks: [], confirmed: false },
      ratings: [],
    })
    expect(doc.mono).toBe('ニッパー,茶葉,,庭#g')
    expect(Object.keys(doc.slots)).toEqual(['wm1', 'wm2'])
  })

  it('人と物に同じ語があっても、それぞれの枠に付く (106 の トロ)', () => {
    const doc = assembleNumberDoc('106', {
      words: [
        word({
          seq: 1,
          item: 0,
          side: 'hito',
          text: 'トロ',
          slot: 'wh1',
          kana: 'とろ',
        }),
        word({
          seq: 2,
          item: 0,
          side: 'mono',
          text: 'トロ',
          slot: 'wm1',
          kana: 'とろ',
        }),
      ],
      head: {
        repPicks: [{ seq: 1, k: 'とろ', text: 'トロ' }],
        confirmed: true,
      },
      ratings: [
        { _id: '106_n1', k: 'とろ', w: 'トロ', v: -1 },
        { _id: '106_1', k: 'とろ', w: 'トロ', v: 2 },
      ],
    })
    expect(doc.slots).toEqual({
      wh1: { word: 'トロ', kana: 'とろ' },
      wm1: { word: 'トロ', kana: 'とろ' },
    })
    expect(doc.rep).toEqual({
      picks: [{ k: 'とろ', w: 'トロ' }],
      confirmed: true,
    })
    // n ラベル由来の評価 (_n) は旧の文書に無いので戻さない
    expect(doc.ratings).toEqual([{ k: 'とろ', w: 'トロ', v: 2 }])
  })
})
