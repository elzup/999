import { describe, expect, it } from 'vitest'
import type { RulesData } from '../data/schema'
import type { NumberDoc } from '../lib/numberApi'
import { planRuleMigration } from '../lib/ruleMigrate'
import { tablesFromRules } from '../lib/reading'

const emptyMatrix = () =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )

/** 1 桁: い=1 み=3 し=4。2 桁は ちゃ / ふぁ の 2 つだけ */
function rules(cha: [number, number], fa: [number, number]): RulesData {
  const doubleMatrix = emptyMatrix()
  doubleMatrix[cha[0]][cha[1]] = ['ちゃ']
  doubleMatrix[fa[0]][fa[1]] = ['ふぁ']
  return {
    singleByDigit: {
      1: { core: ['い'], sub: [], bad: [] },
      3: { core: ['み'], sub: [], bad: [] },
      4: { core: ['し'], sub: [], bad: [] },
    },
    doubleMatrix,
    longMatrix: emptyMatrix(),
    weights: {},
  }
}

// 28=ちゃ / 58=ふぁ → 28=ふぁ / 58=ちゃ
const oldTables = tablesFromRules(rules([2, 8], [5, 8]))
const newTables = tablesFromRules(rules([5, 8], [2, 8]))

const slot = (word: string, kana: string, imageUrl = '') => ({
  word,
  kana,
  imageUrl,
})

const plan = (docs: NumberDoc[]) =>
  planRuleMigration(
    Object.fromEntries(docs.map((d) => [d.num, d])),
    oldTables,
    newTables
  )

describe('planRuleMigration', () => {
  it('新規則で読める番号へ移し、評価と画像を運び、代表から外す', () => {
    const result = plan([
      {
        num: '283',
        slots: {
          wh1: slot('茶味', 'ちゃみ', 'img/a.jpg'),
          wh2: slot('残る', 'ふぁみ'),
        },
        rep: { picks: [{ k: 'ちゃみ', w: '茶味' }], confirmed: true },
        ratings: [{ k: 'ちゃみ', w: '茶味', v: 2 }],
      },
      { num: '583', slots: { wh1: slot('先客', 'ちゃみ') } },
    ])

    expect(result.moves).toEqual([
      {
        from: '283',
        slot: 'wh1',
        word: '茶味',
        kana: 'ちゃみ',
        to: '583',
        targetSlot: 'wh2',
      },
    ])
    expect(result.manual).toEqual([])
    expect(result.docs['583'].slots?.wh2).toEqual(
      slot('茶味', 'ちゃみ', 'img/a.jpg')
    )
    expect(result.docs['583'].ratings).toEqual([
      { k: 'ちゃみ', w: '茶味', v: 2 },
    ])
    // 移動元は詰め直す。ふぁみ は旧規則で 583 なので 283 では元から合っていない (触らない)
    expect(result.docs['283'].slots).toEqual({ wh1: slot('残る', 'ふぁみ') })
    expect(result.docs['283'].rep).toEqual({ picks: [], confirmed: false })
  })

  it('同じ番号から抜ける語を続けて移す。新規則でも合う語は残す', () => {
    const result = plan([
      {
        num: '581',
        slots: {
          wh1: slot('ふぁい1', 'ふぁい'),
          wh2: slot('ふぁい2', 'ふぁいし'),
          wm1: slot('合う', 'ちゃい'),
        },
      },
      { num: '281', slots: {} },
    ])
    expect(
      result.moves.map((m) => [m.from, m.word, m.to, m.targetSlot])
    ).toEqual([
      ['581', 'ふぁい1', '281', 'wh1'],
      ['581', 'ふぁい2', '281', 'wh2'],
    ])
    expect(result.docs['581'].slots).toEqual({ wm1: slot('合う', 'ちゃい') })
  })

  it('移動先に同じ語がある・枠が埋まっている・中間省略で合っていた語は手で直す一覧に出す', () => {
    const result = plan([
      {
        num: '283',
        slots: {
          wh1: slot('同じ', 'ちゃみ'),
          wh2: slot('省略', 'ちゃいみ'),
          wm1: slot('満杯', 'ちゃみ'),
        },
      },
      {
        num: '583',
        slots: {
          wh1: slot('同じ', 'ちゃみ'),
          wm1: slot('a', 'ちゃみ'),
          wm2: slot('b', 'ちゃみ'),
          wm3: slot('c', 'ちゃみ'),
        },
      },
    ])
    expect(result.moves).toEqual([])
    expect(result.manual.map((m) => [m.word, m.reason])).toEqual([
      ['同じ', '583 へ移せない: 583 に同じ語があります'],
      ['省略', '旧規則では中間省略 (1 字飛ばし) で合っていた'],
      ['満杯', '583 へ移せない: 583 の物の枠が埋まっています'],
    ])
  })

  it('後の番号から語が抜けて空いた枠にも、回し直して移す', () => {
    const result = plan([
      { num: '283', slots: { wh1: slot('茶', 'ちゃみ') } },
      {
        num: '583',
        slots: {
          wh1: slot('a', 'ちゃみ'),
          wh2: slot('b', 'ちゃみ'),
          wh3: slot('出る', 'ふぁみ'),
        },
      },
    ])
    expect(result.moves.map((m) => [m.from, m.word, m.to])).toEqual([
      ['583', '出る', '283'],
      ['283', '茶', '583'],
    ])
    expect(result.manual).toEqual([])
  })

  it('残すと指定した語は移さない', () => {
    const result = planRuleMigration(
      {
        '283': {
          num: '283',
          slots: { wm1: slot('葉', 'ちゃみ'), wm2: slot('茶', 'ちゃみい') },
        },
      },
      oldTables,
      newTables,
      [{ num: '283', word: '葉' }]
    )
    expect(result.manual.map((m) => [m.word, m.reason])).toEqual([
      ['葉', '残すと指定した'],
    ])
    expect(result.moves.map((m) => [m.word, m.to])).toEqual([['茶', '583']])
  })
})
