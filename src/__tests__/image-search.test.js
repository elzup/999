import { describe, it, expect, vi } from 'vitest'
import { parseBingImages } from '../images/bing.js'
import { searchImages } from '../images/search.js'

const tile = (murl, purl) =>
  `<a class="iusc" m="{&quot;murl&quot;:&quot;${murl}&quot;,&quot;purl&quot;:&quot;${purl}&quot;}" href="#">`

describe('parseBingImages', () => {
  it('m 属性の JSON から画像URLと出典を抜く', () => {
    const html = tile('https://a.example/x.jpg', 'https://a.example/page')
    expect(parseBingImages(html)).toEqual([
      {
        imageUrl: 'https://a.example/x.jpg',
        sourcePage: 'https://a.example/page',
      },
    ])
  })

  it('&amp; を含む URL を戻す', () => {
    const html = tile('https://a.example/x.jpg?a=1&amp;b=2', '')
    expect(parseBingImages(html)[0].imageUrl).toBe(
      'https://a.example/x.jpg?a=1&b=2'
    )
  })

  it('JSON でない m 属性・murl 無しは捨てる', () => {
    const html = `<div m="{broken"></div><a m="{&quot;purl&quot;:&quot;p&quot;}">`
    expect(parseBingImages(html)).toEqual([])
  })
})

describe('searchImages', () => {
  const hit = (imageUrl) => ({ imageUrl, sourcePage: '' })
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('先頭プロバイダが例外なら次へ逃がす', async () => {
    const spy = quiet()
    const providers = [
      { name: 'a', search: async () => Promise.reject(new Error('DDG 403')) },
      { name: 'b', search: async () => [hit('https://b.example/1.png')] },
    ]
    const results = await searchImages('q', [], true, providers)
    expect(results.map((r) => r.imageUrl)).toEqual(['https://b.example/1.png'])
    spy.mockRestore()
  })

  it('rejected を除外し、画像拡張子の URL を先頭に寄せる', async () => {
    const providers = [
      {
        name: 'a',
        search: async () => [
          hit('https://a.example/view?id=1'),
          hit('https://a.example/old.jpg'),
          hit('https://a.example/new.webp'),
        ],
      },
    ]
    const results = await searchImages(
      'q',
      ['https://a.example/old.jpg'],
      true,
      providers
    )
    expect(results.map((r) => r.imageUrl)).toEqual([
      'https://a.example/new.webp',
      'https://a.example/view?id=1',
    ])
  })

  it('全プロバイダが例外なら理由をまとめて throw', async () => {
    const spy = quiet()
    const providers = [
      { name: 'a', search: async () => Promise.reject(new Error('A 403')) },
      { name: 'b', search: async () => Promise.reject(new Error('B 500')) },
    ]
    await expect(searchImages('q', [], true, providers)).rejects.toThrow(
      /a: A 403 \/ b: B 500/
    )
    spy.mockRestore()
  })

  it('0 件だけなら空配列', async () => {
    const providers = [{ name: 'a', search: async () => [] }]
    expect(await searchImages('q', [], true, providers)).toEqual([])
  })
})
