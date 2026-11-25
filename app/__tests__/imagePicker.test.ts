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
    { slot: 'wh1', imageUrl: 'old.jpg' },
    { slot: 'wm1', variant: 'g', imageUrl: '' },
    { slot: 'wm2', imageUrl: 'keep.jpg' },
  ]
  const picked: Record<string, { url: string }> = {
    '283:w1': { url: 'new.jpg' },
    '283:w2#g': { url: 'tag.jpg' },
  }
  const lookup = (id: string, slot: string) => picked[`${id}:${slot}`] as never

  it('画像タブで選び直した画像を、枠 (タグ違いは «枠#タグ») で当てて差し替える', () => {
    expect(
      withImageOverrides(rows, '283', lookup).map((r) => r.imageUrl)
    ).toEqual(['new.jpg', 'tag.jpg', 'keep.jpg'])
  })

  it('別の番号の選び直しは当てない', () => {
    expect(
      withImageOverrides(rows, '284', lookup).map((r) => r.imageUrl)
    ).toEqual(['old.jpg', '', 'keep.jpg'])
  })
})
