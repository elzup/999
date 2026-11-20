import { describe, expect, it } from 'vitest'
import {
  canonicalRewriteFor,
  canonicalizeDoc,
  halfFor,
  kataPlainFor,
  rekeyEntries,
} from '../kana-canonical.js'

describe('よみを 1 通りの書き方に揃える', () => {
  it('番号に合わない 2 桁かなを半指定 (カタカナ) にする', () => {
    expect(halfFor('みつる', '326')).toBe('みツる')
    expect(halfFor('よつは', '428')).toBe('よツは')
    expect(halfFor('つばさ', '283')).toBe('ツばさ')
  })

  it('番号に合っているよみ・末尾で境界を跨ぐよみは半指定にしない', () => {
    expect(halfFor('すうる', '337')).toBe(null)
    // たま = 55|0 (ま の 2 桁目が余り)。跨ぐ型を書かせるかは未決
    expect(halfFor('たま', '550')).toBe(null)
  })

  it('カタカナを普通に読んでいるよみはひらがなにする', () => {
    expect(kataPlainFor('パソ')).toBe('ぱそ')
    expect(kataPlainFor('よツは')).toBe(null)
  })

  it('番号に合わないよみに語尾の ( ) を付けて形だけ揃えたりしない', () => {
    expect(canonicalRewriteFor('', 'みつる', '326')).toEqual({
      kinds: ['half'],
      to: 'みツる',
    })
  })

  it('語尾の書き足し (最短よみの規則と食い違う) はしない', () => {
    expect(canonicalRewriteFor('にいさん', 'にいさん', '223')).toBe(null)
    expect(canonicalRewriteFor('キスマーク', 'きす', '933')).toBe(null)
  })

  it('途中の読まないかなは ( ) で書く', () => {
    expect(canonicalRewriteFor('', 'さばんな', '387')?.to).toBe('さば(ん)な')
  })
})

describe('代表と評価の付け替え', () => {
  it('かなを書き換えた語の {k, w} だけを新しいかなへ付け替える', () => {
    const moves = [{ word: '四葉', from: 'よつは', to: 'よツは' }]
    expect(
      rekeyEntries(
        [
          { k: 'よつは', w: '四葉', v: 1 },
          { k: 'よつは', w: '別の語', v: 2 },
        ],
        moves
      )
    ).toEqual([
      { k: 'よツは', w: '四葉', v: 1 },
      { k: 'よつは', w: '別の語', v: 2 },
    ])
  })

  it('文書のスロット・代表・評価をまとめて書き換える', () => {
    const doc = {
      num: '428',
      slots: { wh1: { word: '四葉', kana: 'よつは' } },
      rep: { picks: [{ k: 'よつは', w: '四葉' }] },
      ratings: [{ k: 'よつは', w: '四葉', v: 1 }],
    }
    const result = canonicalizeDoc(doc)
    expect(result.changes).toEqual([
      {
        slot: 'wh1',
        kinds: ['half'],
        word: '四葉',
        from: 'よつは',
        to: 'よツは',
      },
    ])
    expect(result.next.slots.wh1.kana).toBe('よツは')
    expect(result.next.rep.picks).toEqual([{ k: 'よツは', w: '四葉' }])
    expect(result.next.ratings).toEqual([{ k: 'よツは', w: '四葉', v: 1 }])
  })

  it('変えるものが無ければ null', () => {
    expect(
      canonicalizeDoc({
        num: '337',
        slots: { wh1: { word: 'x', kana: 'すうる' } },
      })
    ).toBe(null)
  })
})
