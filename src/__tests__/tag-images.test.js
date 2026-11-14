import { describe, expect, it } from 'vitest'
import { tagImagesOf } from '../images/tag-images.js'

describe('tagImagesOf', () => {
  it('«旧スロット#タグ» のキーを配信データの TagImg にまとめる', () => {
    expect(
      tagImagesOf({
        w1: { url: 'a' },
        'w1_2#res': { url: 'b' },
        'w1_2#ｺｰﾄﾞｷﾞｱｽ': { url: 'c' },
        'w2#pr': { url: 'd' },
        'w2_2#x': {},
        'zz#y': { url: 'e' },
        'w1#': { url: 'f' },
      })
    ).toEqual({
      wh2TagImg: { res: 'b', ｺｰﾄﾞｷﾞｱｽ: 'c' },
      wm1TagImg: { pr: 'd' },
    })
  })

  it('manifest が無くても空', () => {
    expect(tagImagesOf(undefined)).toEqual({})
  })
})
