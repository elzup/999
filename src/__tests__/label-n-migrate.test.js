import { describe, expect, it } from 'vitest'
import { columnsOf } from '../firestore/sheet-io.js'
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
  it('移せる位置の項目だけ外す', () => {
    const canMove = (i) => i < 2
    expect(stripLabelNInList('信長 -n,空海#a -n,道元 -n', canMove)).toBe(
      '信長,空海#a,道元 -n'
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
    ratings: [{ k: 'かれん', w: 'カレン#res -n', v: 2 }],
    updatedAt: 't0',
    source: 'sheet',
  }

  it('語から -n を外し、評価の無い語に -1 を付ける', () => {
    const { next, moves, remaining } = migrateLabelNInDoc(doc)
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
      { k: 'こい', w: 'コイ', v: -1 },
    ])
    expect(moves.map((m) => [m.slot, m.rating, m.kept])).toEqual([
      ['wh1', -1, false],
      ['wh2', 2, true],
    ])
    expect(validateNumberDoc('051', next)).toEqual({ ok: true })
  })

  it('移し先の無い語 (かな無し・4 番目以降) は -n を残して報告する', () => {
    const { next, remaining } = migrateLabelNInDoc(doc)
    expect(next.hito).toBe('コイ,カレン#res,ヒミコ,オマケ -n')
    expect(next.mono).toBe('鯉 -n')
    expect(next.slots.wm1.word).toBe('鯉 -n')
    expect(remaining).toEqual(['オマケ -n', '鯉 -n', 'wm1:鯉 -n'])
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
    const twice = migrateLabelNInDoc(once)
    expect(twice?.next ?? null).toBeNull()
  })
})

describe('migrateLabelNInSheet', () => {
  const header = [
    'num',
    '人',
    '物',
    'wh1',
    'wh1k',
    'wh2',
    'wh2k',
    'wh3',
    'wh3k',
    'wm1',
    'wm1k',
    'wm2',
    'wm2k',
    'wm3',
    'wm3k',
  ]
  const row = (num, hito, mono, kana) => {
    const r = Array(header.length).fill('')
    r[0] = num
    r[1] = hito
    r[2] = mono
    for (const [slot, k] of Object.entries(kana)) r[header.indexOf(slot)] = k
    return r
  }

  it('かな列が埋まっている位置の項目だけ書き換える', () => {
    const values = [
      header,
      row('051', 'コイ -n,カレン -n', '鯉 -n', { wh1k: 'こい' }),
      row('052', 'アリス', '', { wh1k: 'ありす' }),
    ]
    const { changes, remaining } = migrateLabelNInSheet(
      values,
      columnsOf(header)
    )
    expect(changes).toEqual([
      {
        cell: 'B2',
        num: '051',
        before: 'コイ -n,カレン -n',
        after: 'コイ,カレン -n',
      },
    ])
    expect(remaining).toEqual([
      { num: '051', word: 'カレン -n' },
      { num: '051', word: '鯉 -n' },
    ])
  })
})
