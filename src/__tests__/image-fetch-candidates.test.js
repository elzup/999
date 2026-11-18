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
