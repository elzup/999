// fetchCandidates: ピッカーに並べる候補を検索から最大 6 枚取る (D-0088)。
// 検索・DL・アップロードはモック。webp 変換 (sharp) だけは本物を通す。

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CANDIDATE_COUNT, fetchCandidates } from '../images/fetch-one.js'

const png = (r, g, b) =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer()

function setup(colors) {
  const results = colors.map((_, i) => ({
    imageUrl: `https://src.test/${i}.png`,
    sourcePage: `https://page.test/${i}`,
  }))
  const uploaded = []
  return {
    uploaded,
    run: (opts = {}) =>
      fetchCandidates({
        query: 'q',
        search: async () => results,
        download: async (url) => {
          const i = Number(url.match(/(\d+)\.png$/)[1])
          if (colors[i] === null) throw new Error('HTTP 403')
          return { buffer: await png(...colors[i]) }
        },
        uploadWebp: async (_webp, key) => {
          uploaded.push(key)
          return { url: `https://bucket.test/${key}` }
        },
        ...opts,
      }),
  }
}

describe('fetchCandidates', () => {
  it('取れなかった候補を飛ばし、検索の順で返す', async () => {
    const { run } = setup([[255, 0, 0], null, [0, 255, 0]])
    const got = await run()
    expect(got.map((c) => c.sourceImageUrl)).toEqual([
      'https://src.test/0.png',
      'https://src.test/2.png',
    ])
    expect(got[0]).toMatchObject({ sourcePage: 'https://page.test/0' })
  })

  it('同じ画像が別の URL で来ても 1 枚にする', async () => {
    const { run } = setup([
      [10, 20, 30],
      [10, 20, 30],
      [200, 0, 0],
    ])
    expect(await run()).toHaveLength(2)
  })

  it(`並べるのは最大 ${CANDIDATE_COUNT} 枚`, async () => {
    const colors = Array.from({ length: 9 }, (_, i) => [i * 25, 100, 50])
    const { run, uploaded } = setup(colors)
    expect(await run()).toHaveLength(CANDIDATE_COUNT)
    expect(uploaded).toHaveLength(CANDIDATE_COUNT)
  })
})

describe('toWebpAt', () => {
  it('寄せ方ごとに 400x400 に切り抜き、知らない寄せ方は断る', async () => {
    const { default: sharp } = await import('sharp')
    const { toWebpAt, CROP_POSITIONS } = await import('../images/process.js')
    // 横長の画像: 左半分が赤、右半分が青
    const input = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#f00' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 400,
              height: 400,
              channels: 3,
              background: '#00f',
            },
          })
            .png()
            .toBuffer(),
          left: 400,
          top: 0,
        },
      ])
      .png()
      .toBuffer()
    const colorOf = async (position) => {
      const { data } = await sharp(await toWebpAt(input, position))
        .raw()
        .toBuffer({ resolveWithObject: true })
      return data[0] > data[2] ? 'red' : 'blue'
    }
    expect(CROP_POSITIONS).toContain('centre')
    expect(await colorOf('left')).toBe('red')
    expect(await colorOf('right')).toBe('blue')
    await expect(toWebpAt(input, 'middle')).rejects.toThrow()
  })
})

describe('toWebpRect', () => {
  it('範囲 (割合) で 400x400 に切り抜き、はみ出す範囲は断る', async () => {
    const { default: sharp } = await import('sharp')
    const { toWebpRect } = await import('../images/process.js')
    // 横長の画像: 左 1/4 が赤、残りが青
    const input = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#00f' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 200,
              height: 400,
              channels: 3,
              background: '#f00',
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer()
    const out = async (rect) =>
      sharp(await toWebpRect(input, rect))
        .raw()
        .toBuffer({ resolveWithObject: true })
    const red = await out({ x: 0, y: 0.25, w: 0.25, h: 0.5 })
    expect(red.info.width).toBe(400)
    expect(red.info.height).toBe(400)
    expect(red.data[0]).toBeGreaterThan(red.data[2])
    const blue = await out({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(blue.data[2]).toBeGreaterThan(blue.data[0])
    await expect(
      toWebpRect(input, { x: 0.8, y: 0, w: 0.5, h: 1 })
    ).rejects.toThrow()
  })
})
