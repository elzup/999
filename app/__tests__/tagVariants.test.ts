import { describe, expect, it } from 'vitest'
import {
  isAttributeTag,
  mergeVariants,
  sourceTags,
  splitVariants,
  variantTag,
} from '../lib/tagVariants'

describe('splitVariants', () => {
  it('出典タグが 2 つ以上なら、出典タグ 1 つずつの語に分ける', () => {
    expect(splitVariants('ニーナ#ｺｰﾄﾞｷﾞｱｽ#res#meme')).toEqual([
      'ニーナ#ｺｰﾄﾞｷﾞｱｽ',
      'ニーナ#res',
      'ニーナ#meme',
    ])
    expect(splitVariants('カレン#res#ｺｰﾄﾞｷﾞｱｽ')).toEqual([
      'カレン#res',
      'カレン#ｺｰﾄﾞｷﾞｱｽ',
    ])
  })

  it('属性タグ (#g / #i) は分けず、分けた語のどれにも残す', () => {
    expect(splitVariants('チャクチ#splatoon#g')).toEqual([
      'チャクチ#splatoon#g',
    ])
    expect(splitVariants('むに#i#grmk')).toEqual(['むに#i#grmk'])
    expect(splitVariants('X#g#aa#bb')).toEqual(['X#g#aa', 'X#g#bb'])
  })

  it('ラベル・注釈は分けた語のどれにも残す', () => {
    expect(splitVariants('フェイ#進撃#doruw -n')).toEqual([
      'フェイ#進撃 -n',
      'フェイ#doruw -n',
    ])
    expect(splitVariants('瑤(よう)#asariri#gen -a -x')).toEqual([
      '瑤(よう)#asariri -a -x',
      '瑤(よう)#gen -a -x',
    ])
  })

  it('出典タグが 1 つ以下・空ならそのまま', () => {
    expect(splitVariants('ハブ#ｳｼｼﾞﾏ')).toEqual(['ハブ#ｳｼｼﾞﾏ'])
    expect(splitVariants('ハブ')).toEqual(['ハブ'])
    expect(splitVariants('')).toEqual([''])
  })

  it('同じタグの重複は 1 つとして数える', () => {
    expect(splitVariants('ユナ#sao#sao')).toEqual(['ユナ#sao#sao'])
  })
})

describe('variantTag / sourceTags', () => {
  it('出典タグがちょうど 1 つのときだけ返す', () => {
    expect(variantTag('カレン#res')).toBe('res')
    expect(variantTag('チャクチ#splatoon#g')).toBe('splatoon')
    expect(variantTag('カレン#res#ｺｰﾄﾞｷﾞｱｽ')).toBe(null)
    expect(variantTag('カレン')).toBe(null)
    expect(variantTag('嫌#g')).toBe(null)
  })

  it('属性タグを除いた出典タグを書かれた順に返す', () => {
    expect(sourceTags('むに#i#grmk#pr -n')).toEqual(['grmk', 'pr'])
    expect(isAttributeTag('g')).toBe(true)
    expect(isAttributeTag('gei')).toBe(false)
  })
})

describe('mergeVariants', () => {
  it('同じ本体の語を最初の位置にまとめる', () => {
    expect(
      mergeVariants(['クマ', 'カレン#res', '紅蓮', 'カレン#ｺｰﾄﾞｷﾞｱｽ'])
    ).toEqual(['クマ', 'カレン#res#ｺｰﾄﾞｷﾞｱｽ', '紅蓮'])
  })

  it('splitVariants の逆になる', () => {
    for (const word of [
      'ニーナ#ｺｰﾄﾞｷﾞｱｽ#res#meme',
      'フェイ#進撃#doruw -n',
      'X#g#aa#bb',
      'チャクチ#splatoon#g',
    ]) {
      expect(mergeVariants(splitVariants(word))).toEqual([word])
    }
  })

  it('本体が違う・空の語はまとめない', () => {
    expect(mergeVariants(['ハブ#ｳｼｼﾞﾏ', 'ハブ#LAN', 'ハブ酒'])).toEqual([
      'ハブ#ｳｼｼﾞﾏ#LAN',
      'ハブ酒',
    ])
    expect(mergeVariants(['', ''])).toEqual(['', ''])
  })
})
