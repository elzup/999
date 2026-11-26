import { describe, expect, it } from 'vitest'
import { mirrorWrites, wordDocId } from '../symbols/mirror.js'

describe('mirrorWrites: 番号の文書 → symbols / words の書き込み', () => {
  const doc = {
    num: '051',
    hito: '鯉太郎',
    mono: '鯉#g',
    gainen: '',
    slots: {
      wh1: { word: '鯉太郎', kana: 'こい' },
      wm1: { word: '鯉#g', kana: 'こい' },
    },
    rep: { picks: [{ k: 'こい', w: '鯉太郎' }], confirmed: true },
    ratings: [],
    updatedAt: 't1',
  }

  it('語ごとに words (merge) を、番号に symbols を 1 件書く', () => {
    const writes = mirrorWrites(doc, 'now')
    const words = writes.filter((w) => w.col === 'words')
    expect(words.map((w) => w.data.key).sort()).toEqual([
      'hito|鯉太郎|',
      'mono|鯉|',
    ])
    expect(words.every((w) => w.merge)).toBe(true)
    const symbol = writes.find((w) => w.col === 'symbols')
    expect(symbol?.id).toBe('n:051')
    expect(symbol?.merge).toBe(false)
    expect(symbol?.data.rep.picks).toEqual([
      { wordId: wordDocId('hito|鯉太郎|') },
    ])
    expect(symbol?.data.mirroredAt).toBe('now')
  })

  it('語の ID は鍵から毎回同じものになる (移行スクリプトと同じ ID)', () => {
    expect(wordDocId('hito|鯉太郎|')).toBe(wordDocId('hito|鯉太郎|'))
    expect(wordDocId('hito|鯉太郎|')).toMatch(/^w_[0-9a-f]{12}$/)
  })
})
