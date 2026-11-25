import { describe, expect, it } from 'vitest'
import { appSlotOf, imageSlotOf, withImageOverrides } from '../lib/imagePicker'

describe('枠名の対応 (語編集 ⇄ 画像のピッカー)', () => {
  it('アプリの枠名とタグから画像の枠名を作る', () => {
    expect(imageSlotOf('wh1')).toBe('w1')
    expect(imageSlotOf('wh2', 'res')).toBe('w1_2#res')
    expect(imageSlotOf('wm3')).toBe('wm3')
  })

  it('画像の枠名からアプリの枠名に戻す (タグ違いの枠も)', () => {
    expect(appSlotOf('w2_2')).toBe('wm2')
    expect(appSlotOf('w1#bang')).toBe('wh1')
    expect(appSlotOf('P')).toBeNull()
  })
})

describe('withImageOverrides', () => {
  const rows = [
    { slot: 'wh1', word: '鯉', imageUrl: 'old.jpg' },
    { slot: 'wm1', variant: 'g', word: '恋#g', imageUrl: '' },
    { slot: 'wm2', word: '池', imageUrl: 'keep.jpg' },
  ]
  const state = {
    picked: {
      '283:w1': { image: { url: 'new.jpg', hash: 'n' }, word: '鯉' },
      '283:w2#g': { image: { url: 'tag.jpg', hash: 't' }, word: '恋' },
    },
    server: {},
    serverLoaded: false,
    saves: {},
  }

  it('この端末で選んだ画像を、枠 (タグ違いは «枠#タグ») で当てて差し替える', () => {
    expect(
      withImageOverrides(rows, '283', state).map((r) => r.imageUrl)
    ).toEqual(['new.jpg', 'tag.jpg', 'keep.jpg'])
  })

  it('別の番号の選び直しは当てない', () => {
    expect(
      withImageOverrides(rows, '284', state).map((r) => r.imageUrl)
    ).toEqual(['old.jpg', '', 'keep.jpg'])
  })

  it('同じ枠でも別の語で選んだ画像は当てない (詰め直しで来た語)', () => {
    const moved = [{ slot: 'wh1', word: 'エクシア', imageUrl: 'exia.jpg' }]
    expect(withImageOverrides(moved, '283', state)[0].imageUrl).toBe('exia.jpg')
  })
})
