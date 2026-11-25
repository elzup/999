import { afterEach, describe, expect, it } from 'vitest'
import {
  isV2DualWrite,
  projectNumberDoc,
  v2WritesFor,
} from '../firestore/v2-project.js'
import { assembleAll } from '../firestore/v2-assemble.js'

const doc = {
  hito: 'トロ, 黄泉#ｽﾀﾚ#tri -n',
  mono: 'トロ,泥,,庭#g',
  gainen: '',
  slots: {
    wh1: { word: 'トロ', kana: 'とろ' },
    wh2: { word: '黄泉#ｽﾀﾚ#tri -n', kana: 'よみ' },
    wm1: { word: 'トロ', kana: 'とろ' },
    wm2: { word: '泥', kana: 'どろ' },
  },
  rep: { picks: [{ k: 'とろ', w: 'トロ' }], confirmed: true },
  ratings: [{ k: 'とろ', w: 'トロ', v: 2 }],
  source: 'app',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

const rows = (docs, collection) =>
  docs
    .filter((d) => d.collection === collection)
    .map((d) => ({ _id: d.id, ...d.data }))

const roundTrip = (num, source) => {
  const projected = projectNumberDoc(num, source)
  return assembleAll({
    words: rows(projected, 'v2_words'),
    heads: rows(projected, 'v2_numbers'),
    ratings: rows(projected, 'v2_ratings'),
  })[num]
}

describe('projectNumberDoc', () => {
  it('人と物の同じ語は、それぞれの side の枠に付く', () => {
    const words = rows(projectNumberDoc('106', doc), 'v2_words')
    expect(words.filter((w) => w.base === 'トロ').map((w) => w.slot)).toEqual([
      'wh1',
      'wm1',
    ])
  })

  it('出典タグ 2 つの項目は 2 語になり、同じ item を持つ', () => {
    const words = rows(projectNumberDoc('106', doc), 'v2_words')
    const yomi = words.filter((w) => w.base === '黄泉')
    expect(yomi.map((w) => w.text)).toEqual(['黄泉#ｽﾀﾚ -n', '黄泉#tri -n'])
    expect(new Set(yomi.map((w) => w.item)).size).toBe(1)
    // n はラベルから外し、評価 -1 に移す
    expect(yomi.every((w) => !w.labels.includes('n'))).toBe(true)
    const nRatings = rows(projectNumberDoc('106', doc), 'v2_ratings').filter(
      (r) => r.v === -1
    )
    expect(nRatings).toHaveLength(2)
  })

  it('組み立て (v2-assemble) で元の文字列・枠・代表・評価に戻る', () => {
    const back = roundTrip('106', doc)
    expect(back.hito).toBe('トロ,黄泉#ｽﾀﾚ#tri -n')
    expect(back.mono).toBe('トロ,泥,,庭#g')
    expect(back.slots).toEqual({
      wh1: { word: 'トロ', kana: 'とろ' },
      wh2: { word: '黄泉#ｽﾀﾚ#tri -n', kana: 'よみ' },
      wm1: { word: 'トロ', kana: 'とろ' },
      wm2: { word: '泥', kana: 'どろ' },
    })
    expect(back.rep).toEqual(doc.rep)
    expect(back.ratings).toEqual(doc.ratings)
  })
})

describe('v2WritesFor', () => {
  it('語が減ったら、余った 番号-連番 の語を消す', () => {
    const next = {
      ...doc,
      mono: 'トロ',
      slots: { wh1: doc.slots.wh1, wm1: doc.slots.wm1 },
    }
    const { sets, deletes } = v2WritesFor('106', doc, next)
    const setIds = new Set(sets.map((d) => d.id))
    expect(deletes.length).toBeGreaterThan(0)
    expect(deletes.every((d) => !setIds.has(d.id))).toBe(true)
  })

  it('前の文書が無ければ消すものは無い (新しい番号)', () => {
    expect(v2WritesFor('106', undefined, doc).deletes).toEqual([])
  })
})

describe('isV2DualWrite', () => {
  const saved = process.env.V2_DUAL_WRITE
  afterEach(() => {
    if (saved === undefined) delete process.env.V2_DUAL_WRITE
    else process.env.V2_DUAL_WRITE = saved
  })

  it('既定は無効 (環境変数が無ければ v2_ に書かない)', () => {
    delete process.env.V2_DUAL_WRITE
    expect(isV2DualWrite()).toBe(false)
    process.env.V2_DUAL_WRITE = '1'
    expect(isV2DualWrite()).toBe(true)
  })
})
