// タグ違いで分けた候補 (D-0039) が、配信データ側 (candidatesOf) と
// DB 側 (candidateRows / 代表の操作) で同じ形に分かれること
import { describe, expect, it } from 'vitest'
import { candidateAt, candidatesOf, slotOfPick } from '../lib/choice'
import {
  candidateRows,
  livePicks,
  slotRows,
  withDeliveredImages,
} from '../lib/numberDetail'
import {
  confirmOp,
  defaultPickSlots,
  isStale,
  togglePick,
} from '../lib/repPicker'
import type { NumberDoc } from '../lib/numberApi'
import type { NumberEntry } from '../data/schema'

const entry = (over: Partial<NumberEntry>): NumberEntry =>
  ({
    num: '900',
    w1: '',
    w1k: '',
    w2: '',
    w2k: '',
    hito: '',
    mono: '',
    gainen: '',
    catScore: null,
    w1Score: null,
    w2Score: null,
    ...over,
  } as NumberEntry)

const KAREN = 'カレン#res#ｺｰﾄﾞｷﾞｱｽ'

const doc = (over: Partial<NumberDoc> = {}): NumberDoc => ({
  num: '900',
  slots: {
    wh1: { word: 'クマ', kana: 'くま', imageUrl: 'https://x.test/kuma.webp' },
    wh2: {
      word: KAREN,
      kana: 'かれん',
      imageUrl: 'https://x.test/old.webp',
      tagImages: { res: 'https://x.test/res.webp' },
    },
    wm1: { word: '紅蓮', kana: 'ぐれん', imageUrl: '' },
  },
  ...over,
})

describe('candidatesOf (配信データ)', () => {
  const e = entry({
    wh1: 'クマ',
    wh1k: 'くま',
    wh2: KAREN,
    wh2k: 'かれん',
    wh2Img: 'https://x.test/old.webp',
    wh2TagImg: { ｺｰﾄﾞｷﾞｱｽ: 'https://x.test/cg.webp' },
  })

  it('出典タグごとの候補に分け、画像はそのタグの画像だけを使う', () => {
    expect(candidatesOf(e)).toEqual([
      { slot: 'wh1', word: 'クマ', kana: 'くま', img: undefined },
      {
        slot: 'wh2',
        word: 'カレン#res',
        kana: 'かれん',
        img: undefined,
        variant: 'res',
      },
      {
        slot: 'wh2',
        word: 'カレン#ｺｰﾄﾞｷﾞｱｽ',
        kana: 'かれん',
        img: 'https://x.test/cg.webp',
        variant: 'ｺｰﾄﾞｷﾞｱｽ',
      },
    ])
  })

  it('candidateAt はスロット単位 (分けない) のまま', () => {
    expect(candidateAt(e, 'wh2')).toMatchObject({
      word: KAREN,
      img: 'https://x.test/old.webp',
    })
  })

  it('slotOfPick は分けた語でも分ける前の語でもスロットを返す', () => {
    expect(slotOfPick(e, { k: 'かれん', w: 'カレン#ｺｰﾄﾞｷﾞｱｽ' })).toBe('wh2')
    expect(slotOfPick(e, { k: 'かれん', w: KAREN })).toBe('wh2')
  })
})

describe('candidateRows (DB)', () => {
  it('分けた行は «スロット#タグ» の key を持ち、画像は tagImages だけ', () => {
    const rows = candidateRows(doc())
    expect(rows.map((row) => [row.key, row.word, row.imageUrl])).toEqual([
      ['wh1', 'クマ', 'https://x.test/kuma.webp'],
      ['wh2#res', 'カレン#res', 'https://x.test/res.webp'],
      ['wh2#ｺｰﾄﾞｷﾞｱｽ', 'カレン#ｺｰﾄﾞｷﾞｱｽ', undefined],
      ['wm1', '紅蓮', ''],
    ])
    expect(rows[2]).toMatchObject({ slot: 'wh2', variant: 'ｺｰﾄﾞｷﾞｱｽ' })
  })

  it('編集フォーム用の slotRows は分けない', () => {
    expect(slotRows(doc()).map((row) => [row.key, row.word])).toEqual([
      ['wh1', 'クマ'],
      ['wh2', KAREN],
      ['wm1', '紅蓮'],
    ])
  })

  it('代表・評価は分けた語の値で当てる', () => {
    const rows = candidateRows(
      doc({
        rep: {
          picks: [{ k: 'かれん', w: 'カレン#ｺｰﾄﾞｷﾞｱｽ' }],
          confirmed: false,
        },
        ratings: [{ k: 'かれん', w: 'カレン#res', v: 2 }],
      })
    )
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
    expect(byKey['wh2#ｺｰﾄﾞｷﾞｱｽ'].repRank).toBe(1)
    expect(byKey['wh2#res'].repRank).toBe(0)
    expect(byKey['wh2#res'].rating).toBe(2)
    expect(byKey['wh2#ｺｰﾄﾞｷﾞｱｽ'].rating).toBe(null)
  })
})

describe('代表の操作 (タグ違い)', () => {
  it('分けた行を key で選ぶと、分けた語が代表になる', () => {
    expect(togglePick(doc(), 'wh2#res')).toEqual([
      { k: 'かれん', w: 'カレン#res' },
    ])
    // 分けていない行は従来どおりスロット名で引ける
    expect(togglePick(doc(), 'wm1')).toEqual([{ k: 'ぐれん', w: '紅蓮' }])
    expect(togglePick(doc(), 'wh2')).toEqual([])
  })

  it('分けた語の代表は生きている。分ける前の語の代表は要再確認', () => {
    const picked = doc({
      rep: { picks: [{ k: 'かれん', w: 'カレン#res' }], confirmed: true },
    })
    expect(livePicks(picked)).toHaveLength(1)
    expect(isStale(picked)).toBe(false)

    const old = doc({
      rep: { picks: [{ k: 'かれん', w: KAREN }], confirmed: true },
    })
    expect(livePicks(old)).toEqual([])
    expect(isStale(old)).toBe(true)
    expect(confirmOp(old)).toBe(null)
  })

  it('既定の代表は、分けた枠では先頭のタグの行', () => {
    const d = doc({
      slots: {
        wh1: { word: KAREN, kana: 'かれん', imageUrl: '' },
        wm1: { word: '紅蓮', kana: 'ぐれん', imageUrl: '' },
      },
    })
    expect(defaultPickSlots(d)).toEqual(['wh1#res', 'wm1'])
    expect(confirmOp(d)).toEqual({
      op: 'rep',
      picks: [
        { k: 'かれん', w: 'カレン#res' },
        { k: 'ぐれん', w: '紅蓮' },
      ],
      confirmed: true,
    })
  })
})

describe('withDeliveredImages (タグ違い)', () => {
  const delivered = entry({
    wh2: KAREN,
    wh2k: 'かれん',
    wh2Img: 'https://x.test/old.webp',
    wh2TagImg: { ｺｰﾄﾞｷﾞｱｽ: 'https://x.test/cg.webp' },
  })
  const bare = doc({
    slots: { wh2: { word: KAREN, kana: 'かれん', imageUrl: '' } },
  })

  it('分けた行は全文が当たる画像だけを補い、スロットの画像を流用しない', () => {
    const rows = withDeliveredImages(candidateRows(bare), delivered)
    expect(rows.map((row) => [row.key, row.imageUrl])).toEqual([
      ['wh2#res', undefined],
      ['wh2#ｺｰﾄﾞｷﾞｱｽ', 'https://x.test/cg.webp'],
    ])
  })

  it('編集フォームの行 (分けない) にはスロットの画像を補う', () => {
    const rows = withDeliveredImages(slotRows(bare), delivered)
    expect(rows[0].imageUrl).toBe('https://x.test/old.webp')
  })
})
