import { describe, expect, it } from 'vitest'
import {
  expandVariants,
  parseSlot,
  splitVariants,
} from '../images/tag-variants.js'
import { splitVariants as appSplitVariants } from '../../app/lib/tagVariants.ts'
import { buildTargets, imageFieldsOf } from '../images/targets.js'
import { tagImagesOf } from '../images/tag-images.js'
import {
  renameTagInKeys,
  renameTagInManifest,
  renameTagInSlotKey,
} from '../tag-rename.js'

const WORDS = [
  'ニーナ#ｺｰﾄﾞｷﾞｱｽ#res#meme',
  'フェイ#進撃#doruw -n',
  'チャクチ#splatoon#g',
  'むに#i#grmk',
  'カレン#res#ｺｰﾄﾞｷﾞｱｽ',
  'ハブ',
  '',
]

describe('splitVariants (console)', () => {
  it('アプリ (app/lib/tagVariants.ts) と同じに分ける', () => {
    for (const word of WORDS) {
      expect(splitVariants(word)).toEqual(appSplitVariants(word))
    }
  })
})

describe('expandVariants', () => {
  it('出典タグが 2 つ以上の枠を «枠#タグ» に分け、他はそのまま', () => {
    const t = expandVariants(
      {
        id: '900',
        w1: 'クマ',
        w1_2: 'カレン#res#ｺｰﾄﾞｷﾞｱｽ',
        w2: 'チャクチ#splatoon#g',
      },
      ['w1', 'w2', 'w1_2', 'w2_2']
    )
    expect(t.slots).toEqual(['w1', 'w2', 'w1_2#res', 'w1_2#ｺｰﾄﾞｷﾞｱｽ', 'w2_2'])
    expect(t['w1_2#res']).toBe('カレン#res')
    expect(t['w1_2#ｺｰﾄﾞｷﾞｱｽ']).toBe('カレン#ｺｰﾄﾞｷﾞｱｽ')
    expect(t.w1_2).toBe('カレン#res#ｺｰﾄﾞｷﾞｱｽ')
  })

  it('buildTargets の対象は slots を持つ', () => {
    const [t] = buildTargets({
      words: [{ num: '217', wh1: 'ニーナ#ｺｰﾄﾞｷﾞｱｽ#res#meme' }],
    })
    expect(t.slots).toEqual([
      'w1#ｺｰﾄﾞｷﾞｱｽ',
      'w1#res',
      'w1#meme',
      'w1_2',
      'wh3',
      'w2',
      'w2_2',
      'wm3',
    ])
  })

  it('人・物の 3 番目も枠に入り、画像は wh3Img / wm3Img に写る', () => {
    const [t] = buildTargets({
      words: [{ num: '129', wh1: 'a', wh3: 'ティグ', wm3: 'b#x#y' }],
    })
    expect(t.wh3).toBe('ティグ')
    expect(t.slots).toContain('wm3#x')
    expect(imageFieldsOf('num', { wh3: { url: 'u' } })).toEqual({ wh3Img: 'u' })
    expect(tagImagesOf({ 'wm3#x': { url: 'v' } })).toEqual({
      wm3TagImg: { x: 'v' },
    })
  })

  it('parseSlot', () => {
    expect(parseSlot('w1_2#res')).toEqual({ base: 'w1_2', tag: 'res' })
    expect(parseSlot('P')).toEqual({ base: 'P', tag: null })
  })
})

describe('タグの改名で画像のキーも変える', () => {
  it('末尾のタグだけを置き換える', () => {
    expect(renameTagInSlotKey('042:w1_2#スプラ', 'スプラ', 'splatoon')).toBe(
      '042:w1_2#splatoon'
    )
    expect(renameTagInSlotKey('042:w1_2', 'スプラ', 'splatoon')).toBe(
      '042:w1_2'
    )
    expect(renameTagInSlotKey('042:w1#xスプラ', 'スプラ', 'y')).toBe(
      '042:w1#xスプラ'
    )
  })

  it('置き換え先が既にあれば上書きしない', () => {
    const { next, moved } = renameTagInKeys(
      { '1:w1#a': 1, '1:w1#b': 2, '2:w1#a': 3 },
      'a',
      'b'
    )
    expect(next).toEqual({ '1:w1#a': 1, '1:w1#b': 2, '2:w1#b': 3 })
    expect(moved).toEqual(['2:w1#a → 2:w1#b'])
  })

  it('manifest は番号ごとの枠のキー', () => {
    const { next } = renameTagInManifest(
      { 900: { w1: { url: 'x' }, 'w1_2#a': { url: 'y' } } },
      'a',
      'b'
    )
    expect(next).toEqual({ 900: { w1: { url: 'x' }, 'w1_2#b': { url: 'y' } } })
  })
})
