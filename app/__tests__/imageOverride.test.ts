import { describe, expect, it } from 'vitest'
import { imageOverride, setImageOverride } from '../lib/imagePicker'

const img = (url: string) => ({ url, hash: url })

describe('imageOverride (選び直した画像を語で確かめる)', () => {
  it('同じ枠でも別の語が来ていれば出さない。語が前の枠へ詰まったら付いていく', () => {
    setImageOverride('901', 'w1', img('a.webp'), 'コブラ')
    setImageOverride('901', 'w1_2', img('b.webp'), 'コミー')
    // wh1 (w1) の コブラ を消して、コミー が w1 に詰まった
    expect(imageOverride('901', 'w1', 'コミー')?.url).toBe('b.webp')
    expect(imageOverride('901', 'w1_2', 'ころん')).toBeUndefined()
    expect(imageOverride('901', 'w1', 'コブラ')?.url).toBe('a.webp')
  })

  it('語を渡さなければ枠で引く。タグ違いの枠と普通の枠は混ぜない', () => {
    setImageOverride('902', 'w1#res', img('t.webp'), '美咲#res')
    expect(imageOverride('902', 'w1#res')?.url).toBe('t.webp')
    expect(imageOverride('902', 'w2', '美咲#res')).toBeUndefined()
    expect(imageOverride('902', 'w2#res', '美咲#res')?.url).toBe('t.webp')
  })
})
