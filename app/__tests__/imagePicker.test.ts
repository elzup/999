import { describe, expect, it } from 'vitest'
import { appSlotOf, imageSlotOf } from '../lib/imagePicker'

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
