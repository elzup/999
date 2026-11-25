import { describe, expect, it } from 'vitest'
import { createImageStore, slotImageOf } from '../lib/imageStore'

const img = (url: string) => ({ url, hash: url })

describe('imageStore', () => {
  it('選んだ画像 → imageSlots → 呼び出し側の画像 の順に引く', () => {
    const store = createImageStore()
    store
      .getState()
      .loadServer(
        { '282': { w1: img('server.webp') } },
        { '282:w1': { word: 'ジェシー' } }
      )
    const get = () =>
      slotImageOf(store.getState(), '282', 'w1', 'ジェシー', 'db.webp')
    expect(get()).toEqual({ url: 'server.webp', source: 'server' })
    store.getState().pick('282', 'w1', img('picked.webp'), 'ジェシー')
    expect(get()).toEqual({ url: 'picked.webp', source: 'picked' })
  })

  it('同じ枠でも語が違えば、選んだ画像も imageSlots の画像も当てない', () => {
    const store = createImageStore()
    store
      .getState()
      .loadServer(
        { '282': { w1: img('jessie.webp') } },
        { '282:w1': { word: 'ジェシー#ｽﾀﾚ' } }
      )
    expect(
      slotImageOf(store.getState(), '282', 'w1', 'エクシア', 'exia.webp')
    ).toEqual({ url: 'exia.webp', source: 'fallback' })
    // タグ・ラベル違いは同じ語
    expect(slotImageOf(store.getState(), '282', 'w1', 'ジェシー -n')?.url).toBe(
      'jessie.webp'
    )
  })

  it('語を省いて差し替えると、前に選んだときの語を引き継ぐ (サーバの切り抜き後の画像)', () => {
    const store = createImageStore()
    store.getState().pick('100', 'w1', img('a.webp'), '鯉')
    store.getState().pick('100', 'w1', img('a-crop.webp'))
    expect(slotImageOf(store.getState(), '100', 'w1', '恋')).toBeNull()
    expect(slotImageOf(store.getState(), '100', 'w1', '鯉')?.url).toBe(
      'a-crop.webp'
    )
  })
})
