import { describe, expect, it } from 'vitest'
import { withLiveNumberTargets, wordRowOf } from '../live-targets.js'
import { buildTargets } from '../targets.js'

const baked = {
  kinds: undefined,
  targets: buildTargets({
    words: [
      { num: '001', wh1: '古い語', wh1k: 'ひ' },
      { num: '002', wm1: '残る語', wm1k: 'に' },
    ],
    dates: [{ num: '1001', wh1: '日付の語', wh1k: 'とおい' }],
    cards: [],
  }),
}

describe('withLiveNumberTargets', () => {
  it('DB の文書から番号の対象を作り直し、アプリで足した語も対象になる', () => {
    const docs = {
      '001': { slots: { wh1: { word: '新しい語', kana: 'ひ' } } },
      339: {
        slots: {
          wh1: { word: '美咲#bang#ml', kana: 'みさき' },
          wm1: { word: 'スキー', kana: 'すき' },
        },
      },
    }
    const { targets } = withLiveNumberTargets(baked, docs)
    expect(targets.map((t) => t.id)).toEqual(['001', '002', '339', '1001'])
    expect(targets[0].w1).toBe('新しい語')
    // DB に無い番号は焼いた対象のまま
    expect(targets[1].w2).toBe('残る語')
    // タグ違いは焼いたときと同じく枠を分ける
    expect(targets[2].slots).toContain('w1#bang')
    expect(targets[2]['w1#ml']).toBe('美咲#ml')
    expect(targets[3].kind).toBe('date')
  })

  it('DB で語を全部消した番号は対象から外す', () => {
    const { targets } = withLiveNumberTargets(baked, { '002': { slots: {} } })
    expect(targets.map((t) => t.id)).toEqual(['001', '1001'])
  })

  it('wordRowOf は words.tsv の行と同じ形にする', () => {
    expect(
      wordRowOf('005', { slots: { wm2: { word: '孫#g', kana: 'まご' } } })
    ).toMatchObject({ num: '005', wm2: '孫#g', wm2k: 'まご', wh1: '' })
  })
})
