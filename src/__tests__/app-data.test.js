import { describe, expect, it } from 'vitest'
import {
  UNAUTHORIZED,
  expectedChunkIds,
  loadAppData,
  loadWithCache,
  makeCache,
} from '../firestore/app-data.js'

const docFor = (num) => ({
  num,
  slots: { wh1: { word: `w${num}`, kana: 'こい', imageUrl: '' } },
})

/** chunk_0..9 を返す readChunk。missing に挙げた id は null を返す */
function chunks({ missing = [], onRead } = {}) {
  return async (id) => {
    onRead?.(id)
    if (missing.includes(id)) return null
    const index = Number(id.slice('chunk_'.length))
    return {
      id,
      builtAt: 'T',
      numbers: [docFor(String(index * 100).padStart(3, '0'))],
    }
  }
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  }
}

describe('app data source', () => {
  it('REQ-APP-001: reads exactly ten chunks to assemble the dictionary', async () => {
    const seen = []
    const result = await loadAppData({
      readChunk: chunks({ onRead: (id) => seen.push(id) }),
    })

    expect(seen).toHaveLength(10)
    expect(new Set(seen)).toEqual(new Set(expectedChunkIds()))
    expect(result.numbers).toHaveLength(10)
    expect(result.missing).toEqual([])
  })

  it('assembles the numbers in chunk order', async () => {
    const result = await loadAppData({ readChunk: chunks() })

    expect(result.numbers.map((d) => d.num)).toEqual([
      '000',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ])
  })

  it('REQ-APP-005: reports a missing chunk but keeps what it could read', async () => {
    const result = await loadAppData({
      readChunk: chunks({ missing: ['chunk_3'] }),
    })

    expect(result.missing).toEqual(['chunk_3'])
    expect(result.numbers).toHaveLength(9)
  })

  it('REQ-APP-002: lets an authentication failure through instead of degrading', async () => {
    const readChunk = async () => {
      throw new Error(UNAUTHORIZED)
    }

    await expect(loadAppData({ readChunk })).rejects.toThrow(UNAUTHORIZED)
  })

  it('REQ-APP-003: falls back to the cache when the read fails', async () => {
    const cache = makeCache(memoryStorage())
    await loadWithCache({ readChunk: chunks(), cache })

    const offline = await loadWithCache({
      readChunk: async () => {
        throw new Error('network down')
      },
      cache,
    })

    expect(offline.fromCache).toBe(true)
    expect(offline.numbers).toHaveLength(10)
  })

  it('REQ-APP-002: never serves the cache when unauthorized', async () => {
    const cache = makeCache(memoryStorage())
    await loadWithCache({ readChunk: chunks(), cache })

    await expect(
      loadWithCache({
        readChunk: async () => {
          throw new Error(UNAUTHORIZED)
        },
        cache,
      })
    ).rejects.toThrow(UNAUTHORIZED)
  })

  it('REQ-APP-005: an empty result is a failure, not an empty dictionary', async () => {
    // 全滅を «成功して 0 件» として返すと、通信断でアプリが真っ白になる
    const cache = makeCache(memoryStorage())

    await expect(
      loadWithCache({ readChunk: async () => null, cache })
    ).rejects.toThrow(/no chunk could be read/)
  })

  it('does not cache a partial read', async () => {
    const cache = makeCache(memoryStorage())
    await loadWithCache({ readChunk: chunks({ missing: ['chunk_3'] }), cache })

    expect(cache.read()).toBe(null)
  })

  it('REQ-APP-004: picks up new chunk content without any redeploy', async () => {
    const cache = makeCache(memoryStorage())
    const first = await loadWithCache({ readChunk: chunks(), cache })

    const updated = async (id) => {
      const bundle = await chunks()(id)
      if (id === 'chunk_0') bundle.numbers[0].slots.wh1.word = '書き換え後'
      return bundle
    }
    const second = await loadWithCache({ readChunk: updated, cache })

    expect(first.numbers[0].slots.wh1.word).not.toBe('書き換え後')
    expect(second.numbers[0].slots.wh1.word).toBe('書き換え後')
  })

  it('survives a storage that refuses to write', async () => {
    const cache = makeCache({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    })

    await expect(
      loadWithCache({ readChunk: chunks(), cache })
    ).resolves.toMatchObject({
      fromCache: false,
    })
  })
})
