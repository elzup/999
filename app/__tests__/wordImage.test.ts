import { describe, expect, it } from 'vitest'
import { wordImage } from '../lib/wordImage'

const BASE =
  'https://storage.googleapis.com/anoz-memosupo-words/words/0123456789abcdef0123'

describe('wordImage', () => {
  it('バケットの画像は縮小版を srcset に並べ、表示幅を sizes に入れる', () => {
    expect(wordImage(`${BASE}.webp`, 34)).toEqual({
      src: `${BASE}.webp`,
      srcset: `${BASE}@96.webp 96w, ${BASE}@240.webp 240w, ${BASE}.webp 400w`,
      sizes: '34px',
    })
  })

  it('バケットの外の画像はそのまま (縮小版が無い)', () => {
    expect(wordImage('https://example.com/a.jpg', 34)).toEqual({
      src: 'https://example.com/a.jpg',
    })
  })

  it('#g (概念) の語には枠を付ける印を足す。#gx のような別タグには付けない', () => {
    expect(wordImage('https://example.com/a.jpg', 34, '重力#g')).toEqual({
      src: 'https://example.com/a.jpg',
      'data-concept': true,
    })
    expect(
      wordImage('https://example.com/a.jpg', 34, '重力#gx')
    ).not.toHaveProperty('data-concept')
    expect(wordImage('https://example.com/a.jpg', 34, '重力')).not.toHaveProperty(
      'data-concept'
    )
  })
})
