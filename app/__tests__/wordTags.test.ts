import { describe, expect, it } from 'vitest'
import {
  addLabel,
  addTag,
  normalizeTag,
  parseWord,
  removeLabel,
  removeTag,
  suggestTags,
} from '../lib/wordTags'

describe('parseWord', () => {
  it.each([
    ['ロッシ#enfi -a', { base: 'ロッシ', tags: ['enfi'], labels: ['a'] }],
    [
      'ヒナ#プリコネ#bl',
      { base: 'ヒナ', tags: ['プリコネ', 'bl'], labels: [] },
    ],
    ['甘雨(かんう)#gen', { base: '甘雨(かんう)', tags: ['gen'], labels: [] }],
    ['鯉', { base: '鯉', tags: [], labels: [] }],
    ['ミッキー -a -x', { base: 'ミッキー', tags: [], labels: ['a', 'x'] }],
    // 本体の無い項目 (シートの «ニーナ#a,#b» の 2 つ目)
    ['#res', { base: '', tags: ['res'], labels: [] }],
    // 本体の中のハイフンはラベルではない
    ['T-REX', { base: 'T-REX', tags: [], labels: [] }],
  ])('%s', (word, expected) => {
    expect(parseWord(word)).toEqual(expected)
  })
})

describe('タグの付け外し', () => {
  it('ラベルより前に足す', () => {
    expect(addTag('ロッシ -a', 'enfi')).toBe('ロッシ#enfi -a')
    expect(addTag('ロッシ#enfi -a -x', 'meme')).toBe('ロッシ#enfi#meme -a -x')
    expect(addTag('鯉', '#g')).toBe('鯉#g')
  })

  it('同じタグは重ねない・空は足さない', () => {
    expect(addTag('鯉#g', 'g')).toBe('鯉#g')
    expect(addTag('鯉', '  ')).toBe('鯉')
  })

  it('外すのはそのタグだけ (前方一致の別タグは残す)', () => {
    expect(removeTag('ヒナ#プリコネ#bl', 'プリコネ')).toBe('ヒナ#bl')
    expect(removeTag('羽#a#ab', 'a')).toBe('羽#ab')
    expect(removeTag('ロッシ#enfi -a', 'enfi')).toBe('ロッシ -a')
  })

  it('区切り文字はタグから落とす', () => {
    expect(normalizeTag('#a b,c')).toBe('abc')
  })
})

describe('ラベルの付け外し', () => {
  it('末尾に足し、外すと空白も詰める', () => {
    expect(addLabel('ロッシ#enfi', 'a')).toBe('ロッシ#enfi -a')
    expect(addLabel('ロッシ -a', 'a')).toBe('ロッシ -a')
    expect(removeLabel('ミッキー -a -x', 'a')).toBe('ミッキー -x')
    expect(removeLabel('T-REX -a', 'a')).toBe('T-REX')
  })
})

describe('suggestTags', () => {
  const known = [
    { tag: 'g', count: 50 },
    { tag: 'pr', count: 20 },
    { tag: 'gen', count: 10 },
    { tag: 'meme', count: 3 },
    { tag: 'ガンダム', count: 2 },
  ]
  it('前方一致を先に、回数順で出す', () => {
    expect(suggestTags(known, 'g', []).map((s) => s.tag)).toEqual(['g', 'gen'])
    expect(suggestTags(known, 'e', []).map((s) => s.tag)).toEqual([
      'gen',
      'meme',
    ])
  })
  it('付いているタグは除く', () => {
    expect(suggestTags(known, '', ['g'], 2).map((s) => s.tag)).toEqual([
      'pr',
      'gen',
    ])
  })
})

describe('suggestTags の表示名での検索', () => {
  const known = [
    { tag: 'res', count: 15, name: 'アトリエ' },
    { tag: 'splatoon', count: 16, name: 'スプラ' },
    { tag: 'ｺｰﾄﾞｷﾞｱｽ', count: 5 },
  ]
  it('表示名の前方一致・部分一致で出す', () => {
    expect(suggestTags(known, 'アトリ', []).map((s) => s.tag)).toEqual(['res'])
    expect(suggestTags(known, 'リエ', []).map((s) => s.tag)).toEqual(['res'])
  })
  it('半角カナ・全角の違いをそろえて当てる', () => {
    expect(suggestTags(known, 'ｽﾌﾟﾗ', []).map((s) => s.tag)).toEqual([
      'splatoon',
    ])
    expect(suggestTags(known, 'コード', []).map((s) => s.tag)).toEqual([
      'ｺｰﾄﾞｷﾞｱｽ',
    ])
  })
  it('id でも今までどおり当たる', () => {
    expect(suggestTags(known, 'spl', []).map((s) => s.tag)).toEqual([
      'splatoon',
    ])
  })
})
