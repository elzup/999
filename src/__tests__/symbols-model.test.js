import { describe, expect, it } from 'vitest'
import {
  byId,
  formatNotation,
  fromCard,
  fromNumberDoc,
  fromNumberEntry,
  mergeWords,
  parseNotation,
  resolveRefs,
  splitSources,
  toCard,
  toNumberDoc,
  toNumberEntry,
} from '../symbols/model.js'

const roundTripEntry = (entry) => {
  const { symbol, words } = fromNumberEntry(entry)
  return toNumberEntry(symbol, byId(words))
}

const entry = (over) => ({
  num: '106',
  hito: '',
  mono: '',
  gainen: '',
  wh1: '',
  wh1k: '',
  wh2: '',
  wh2k: '',
  wh3: '',
  wh3k: '',
  wm1: '',
  wm1k: '',
  wm2: '',
  wm2k: '',
  wm3: '',
  wm3k: '',
  ...over,
})

describe('表記', () => {
  it('本体・タグ・ラベルに分け、側ごとの並びで戻す', () => {
    expect(parseNotation('黄泉#ｽﾀﾚ -n')).toEqual({
      text: '黄泉',
      tags: ['ｽﾀﾚ'],
      labels: ['n'],
    })
    // 物の側は «語 -ラベル#タグ» (words.js の serializeTaggedItems の並び)
    expect(parseNotation('牢屋 -a#g')).toEqual({
      text: '牢屋',
      tags: ['g'],
      labels: ['a'],
    })
    const parsed = { text: '牢屋', tags: ['g'], labels: ['a'] }
    expect(formatNotation(parsed, 'hito')).toBe('牢屋#g -a')
    expect(formatNotation(parsed, 'mono')).toBe('牢屋 -a#g')
  })

  it('出典タグ 2 つは語 2 つ。属性タグはどちらにも残す', () => {
    expect(
      splitSources(parseNotation('黄泉#g#ｽﾀﾚ#tri')).map((p) => p.tags)
    ).toEqual([
      ['g', 'ｽﾀﾚ'],
      ['g', 'tri'],
    ])
  })
})

describe('配信データの番号 1 件', () => {
  it('往復で元に戻る (空の項目・末尾の空・分けた語・スコア)', () => {
    const before = entry({
      hito: 'トロ,黄泉#ｽﾀﾚ#tri,',
      mono: 'トロ,,庭 -a#g',
      wh1: 'トロ',
      wh1k: 'とろ',
      wh2: '黄泉#ｽﾀﾚ#tri',
      wh2k: 'よみ',
      wm1: 'トロ',
      wm1k: 'とろ',
    })
    const after = roundTripEntry(before)
    expect(after.hito).toBe(before.hito)
    expect(after.mono).toBe(before.mono)
    expect(after.wh2).toBe('黄泉#ｽﾀﾚ#tri')
    expect(after.w1).toBe('トロ')
    expect(after.w1_2).toBe('黄泉#ｽﾀﾚ#tri')
    // w2_2 は空なので欄ごと無い (配信データの形)
    expect('w2_2' in after).toBe(false)
    expect(typeof after.catScore).toBe('number')
  })

  it('一覧に語があっても枠が空なら、空のまま戻す (439 の wm2)', () => {
    const before = entry({ mono: '雪,雫', wm1: '雪', wm1k: 'ゆき' })
    expect(roundTripEntry(before).wm2).toBe('')
  })

  it('人のトロと物のトロは別の語', () => {
    const { words } = fromNumberEntry(
      entry({ hito: 'トロ', mono: 'トロ', wh1: 'トロ', wm1: 'トロ' })
    )
    expect(words.map((w) => w.id)).toEqual(['hito|トロ|', 'mono|トロ|'])
  })
})

describe('番号の文書', () => {
  const doc = {
    num: '106',
    hito: 'トロ',
    mono: 'トロ,泥',
    slots: {
      wh1: { word: 'トロ', kana: 'とろ', imageUrl: 'https://example/x.webp' },
      wm1: { word: 'トロ', kana: 'とろ' },
      wm2: { word: '泥', kana: 'どろ' },
    },
    rep: { picks: [{ k: 'どろ', w: '泥' }], confirmed: true },
    ratings: [{ k: 'とろ', w: 'トロ', v: 2 }],
    updatedAt: '2026-11-26T00:00:00.000Z',
    source: 'app',
  }

  it('往復で元に戻る (枠の画像・代表・評価・時刻)', () => {
    const { symbol, words } = fromNumberDoc(doc)
    expect(toNumberDoc(symbol, byId(words))).toEqual(doc)
  })

  it('代表・評価がどの語を指すか。かなが同じで人と物の両方に当たるものは 2 つ返す', () => {
    const { symbol, words } = fromNumberDoc(doc)
    const refs = resolveRefs(symbol, byId(words))
    expect(refs.find((r) => r.kind === 'rep').wordIds).toEqual(['mono|泥|'])
    expect(refs.find((r) => r.kind === 'rating').wordIds).toEqual([
      'hito|トロ|',
      'mono|トロ|',
    ])
  })
})

describe('カード', () => {
  const card = {
    suit: 'S',
    rank: '2',
    person: '',
    actionP: '',
    personScore: null,
    object: 'ニス',
    actionO: '塗る',
    objectScore: 3,
    action: 'ニス塗る',
    actionScore: 1,
    objectImg: 'https://example/o.webp',
  }

  it('往復で元に戻る。スコアは結び付きの評価', () => {
    const { symbol, words } = fromCard(card)
    expect(symbol.links.find((l) => l.wordId === 'mono|ニス|').rating).toBe(3)
    expect(toCard(symbol, byId(words))).toEqual(card)
  })

  it('番号の物のニスと、カードの物のニスは同じ語', () => {
    const fromNumber = fromNumberEntry(
      entry({ num: '233', mono: 'ニス', wm1: 'ニス' })
    )
    const merged = mergeWords([fromNumber.words, fromCard(card).words])
    expect(Object.keys(merged.words)).toContain('mono|ニス|')
    expect(merged.conflicts).toEqual([])
  })
})
