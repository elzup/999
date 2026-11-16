import { describe, expect, it } from 'vitest'
import { validateNumberDoc } from '../firestore/number-doc.js'
import {
  hasLabelN,
  migrateLabelNInDoc,
  migrateLabelNInSheet,
  stripLabelN,
  stripLabelNInList,
} from '../label-n-migrate.js'

describe('stripLabelN', () => {
  it('-n だけを外し、ほかのラベル・タグは残す', () => {
    expect(stripLabelN('キレイ -n')).toBe('キレイ')
    expect(stripLabelN('ロッシ#enfi -a -n')).toBe('ロッシ#enfi -a')
    expect(stripLabelN('ロッシ -n -a')).toBe('ロッシ -a')
  })

  it('# の直前にある -n も外し、タグを語に詰める', () => {
    expect(stripLabelN('茶湯 -n#g')).toBe('茶湯#g')
  })

  it('-nx のような別の記号や語中の -n は触らない', () => {
    expect(hasLabelN('ab-n')).toBe(false)
    expect(hasLabelN('ab -nx')).toBe(false)
    expect(stripLabelN('ab-n')).toBe('ab-n')
  })
})

describe('stripLabelNInList', () => {
  it('一覧の全項目から外す', () => {
    expect(stripLabelNInList('信長 -n,空海#a -n,道元 -n')).toBe(
      '信長,空海#a,道元'
    )
  })
})

describe('migrateLabelNInDoc', () => {
  const doc = {
    num: '051',
    hito: 'コイ -n,カレン#res -n,ヒミコ,オマケ -n',
    mono: '鯉 -n',
    gainen: '',
    slots: {
      wh1: {
        word: 'コイ -n',
        kana: 'こい',
        imageUrl: 'u1',
        confirmedFor: 'コイ -n',
      },
      wh2: { word: 'カレン#res -n', kana: 'かれん', imageUrl: '' },
      wh3: { word: 'ヒミコ', kana: 'ひみこ', imageUrl: '' },
      // かなの無い枠は評価の移し先が無い
      wm1: { word: '鯉 -n', kana: '', imageUrl: '' },
    },
    rep: { picks: [{ k: 'こい', w: 'コイ -n' }], confirmed: true },
    ratings: [
      { k: 'かれん', w: 'カレン#res -n', v: 2 },
      { k: 'ひみこ', w: 'ヒミコ', v: 1 },
    ],
    updatedAt: 't0',
    source: 'sheet',
  }

  it('語から -n を外し、かなのある語で評価の無いものに -1 を付ける', () => {
    const { next, moves } = migrateLabelNInDoc(doc)
    expect(next.slots.wh1).toEqual({
      word: 'コイ',
      kana: 'こい',
      imageUrl: 'u1',
      confirmedFor: 'コイ',
    })
    expect(next.slots.wh2.word).toBe('カレン#res')
    expect(next.rep.picks).toEqual([{ k: 'こい', w: 'コイ' }])
    expect(next.ratings).toEqual([
      // 既にあった評価は付け替えるだけで値は残す
      { k: 'かれん', w: 'カレン#res', v: 2 },
      { k: 'ひみこ', w: 'ヒミコ', v: 1 },
      { k: 'こい', w: 'コイ', v: -1 },
    ])
    expect(moves.map((m) => [m.slot, m.rating, m.kept])).toEqual([
      ['wh1', -1, false],
      ['wh2', 2, true],
    ])
    expect(validateNumberDoc('051', next)).toEqual({ ok: true })
  })

  it('かなの無い枠・4 番目以降の語も -n を外す (評価は付けない)', () => {
    const { next, unrated } = migrateLabelNInDoc(doc)
    expect(next.hito).toBe('コイ,カレン#res,ヒミコ,オマケ')
    expect(next.mono).toBe('鯉')
    expect(next.slots.wm1.word).toBe('鯉')
    expect(unrated).toEqual([
      { side: 'hito', word: 'オマケ' },
      { side: 'mono', word: '鯉' },
    ])
  })

  it('同じ番号に有力な別の語がある -1 / 評価なしの語を削除検討候補にする', () => {
    const { candidates } = migrateLabelNInDoc(doc)
    expect(candidates).toEqual([
      // コイ は代表だが自分自身なので、ほかの +1 以上の語が有力な別の語
      {
        word: 'コイ',
        k: 'こい',
        rating: -1,
        rivals: ['カレン#res (評価 +2)', 'ヒミコ (評価 +1)'],
      },
      {
        word: 'オマケ',
        k: '',
        rating: null,
        rivals: ['カレン#res (評価 +2)', 'ヒミコ (評価 +1)', 'コイ (代表)'],
      },
      {
        word: '鯉',
        k: '',
        rating: null,
        rivals: ['カレン#res (評価 +2)', 'ヒミコ (評価 +1)', 'コイ (代表)'],
      },
    ])
  })

  it('有力な別の語が無ければ候補にしない', () => {
    const { candidates } = migrateLabelNInDoc({
      num: '053',
      hito: 'コイ -n,ネコ',
      slots: {
        wh1: { word: 'コイ -n', kana: 'こい', imageUrl: '' },
        wh2: { word: 'ネコ', kana: 'ねこ', imageUrl: '' },
      },
      ratings: [{ k: 'ねこ', w: 'ネコ', v: 0 }],
    })
    expect(candidates).toEqual([])
  })

  it('-n が無ければ null', () => {
    expect(
      migrateLabelNInDoc({
        num: '000',
        hito: 'アリス',
        slots: { wh1: { word: 'アリス', kana: 'ありす', imageUrl: '' } },
      })
    ).toBeNull()
  })

  it('外した語と同じ語の評価が既にあれば重ねない', () => {
    const { next } = migrateLabelNInDoc({
      num: '052',
      hito: 'コイ -n',
      slots: { wh1: { word: 'コイ -n', kana: 'こい', imageUrl: '' } },
      ratings: [
        { k: 'こい', w: 'コイ', v: 1 },
        { k: 'こい', w: 'コイ -n', v: 0 },
      ],
    })
    expect(next.ratings).toEqual([{ k: 'こい', w: 'コイ', v: 1 }])
  })

  it('2 回かけても変わらない', () => {
    const once = migrateLabelNInDoc(doc).next
    expect(migrateLabelNInDoc(once)).toBeNull()
  })
})

describe('migrateLabelNInSheet', () => {
  it('人 / 物 セルの全項目から外す', () => {
    const values = [
      ['num', '人', '物', 'wh1'],
      ['051', 'コイ -n,カレン -n', '鯉 -n', '=PICK_FIRST(B2,1)'],
      ['052', 'アリス', '', ''],
    ]
    expect(migrateLabelNInSheet(values)).toEqual([
      { cell: 'B2', before: 'コイ -n,カレン -n', after: 'コイ,カレン' },
      { cell: 'C2', before: '鯉 -n', after: '鯉' },
    ])
  })
})
