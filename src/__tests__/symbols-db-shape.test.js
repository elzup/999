import { describe, expect, it } from 'vitest'
import { byId, fromNumberDoc, toNumberDoc } from '../symbols/model.js'
import { fromDbSymbol, toDbSymbol } from '../symbols/db-shape.js'

const doc = {
  num: '001',
  hito: 'まい#日常,麻衣(先輩)',
  mono: '火',
  gainen: '',
  slots: {
    wh1: { word: 'まい#日常', kana: 'まい' },
    wh2: { word: '麻衣(先輩)', kana: 'まい' },
    wm1: { word: '火', kana: 'ひ' },
  },
  rep: {
    picks: [
      { k: 'まい', w: 'まい#日常' },
      { k: 'みなみ', w: '南' },
    ],
    confirmed: true,
  },
  ratings: [
    { k: 'ひ', w: '火', v: 2 },
    { k: 'さや', w: '', v: 1 },
  ],
  updatedAt: 't0',
}

const docIdOf = (key) => `w_${key}`
const keyOf = (id) => id.slice(2)

function roundTrip(input) {
  const { symbol, words } = fromNumberDoc(input)
  const wordsById = byId(words)
  const { doc: db, stats } = toDbSymbol(symbol, wordsById, docIdOf)
  const back = fromDbSymbol(symbol.id, db, keyOf, wordsById)
  return { db, stats, back: toNumberDoc(back, wordsById) }
}

describe('db-shape: DB に置く symbol の形', () => {
  it('代表と評価は語の ID で指す。決まらないものは文字列のまま残す', () => {
    const { db, stats } = roundTrip(doc)
    expect(db.rep.picks).toEqual([
      { wordId: 'w_hito|まい|日常' },
      { k: 'みなみ', w: '南' },
    ])
    expect(db.words.find((w) => w.wordId === 'w_mono|火|')?.rating).toBe(2)
    expect(db.looseRatings).toEqual([{ k: 'さや', w: '', v: 1 }])
    expect(db.wordIds).toContain('w_hito|麻衣(先輩)|')
    expect(stats).toEqual({
      picks: 2,
      loosePicks: 1,
      ratings: 2,
      looseRatings: 1,
    })
  })

  it('DB の形から元の文書に戻せる (評価の並びは問わない)', () => {
    const { back } = roundTrip(doc)
    expect({ ...back, ratings: undefined }).toEqual({
      ...doc,
      ratings: undefined,
    })
    expect(back.ratings).toEqual(expect.arrayContaining(doc.ratings))
    expect(back.ratings).toHaveLength(doc.ratings.length)
  })

  it('結び付きの tags には属性タグだけを置き、出典は語の source に任せる', () => {
    const { db } = roundTrip(doc)
    const mai = db.words.find((w) => w.wordId === 'w_hito|まい|日常')
    expect(mai.tags).toEqual([])
    expect(mai.sourceAt).toBeUndefined()
  })

  it('属性タグが出典より前の並び (#i#grmk) も表記に戻せる', () => {
    const input = {
      ...doc,
      hito: '三田#i#grmk,ミタ#grmk#i',
      slots: {},
      rep: undefined,
      ratings: undefined,
    }
    const { db, back } = roundTrip(input)
    expect(db.words.map((w) => [w.tags, w.sourceAt])).toEqual([
      [['i'], 1],
      [['i'], undefined],
      [[], undefined],
    ])
    expect(back.hito).toBe(input.hito)
  })

  it('k / w / v 以外の欄を持つ評価は作り直せないので文字列のまま残す', () => {
    const stale = { ...doc, ratings: [{ k: 'ひ', w: '火', v: 2, stale: true }] }
    const { db } = roundTrip(stale)
    expect(db.looseRatings).toEqual(stale.ratings)
  })
})
