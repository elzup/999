import { describe, expect, it } from 'vitest'
import {
  BUNDLE_SIZE,
  CHUNK_COUNT,
  bundleIdFor,
  buildBundle,
  buildAllBundles,
  mergeBundles,
} from '../firestore/bundles.js'

const docFor = (num) => ({
  num,
  slots: { wh1: { word: `w${num}`, kana: 'こい', imageUrl: '' } },
  rep: null,
  ratings: [],
  derived: { ptBySlot: { wh1: 2 }, rankeyBySlot: { wh1: '_AA|' } },
  updatedAt: '2026-08-20T00:00:00.000Z',
  source: 'sheet',
})

const allDocs = Array.from({ length: 1000 }, (_, i) =>
  docFor(String(i).padStart(3, '0'))
)

describe('read bundles', () => {
  it('REQ-BND-004: a full load needs exactly CHUNK_COUNT reads', () => {
    const bundles = buildAllBundles(allDocs, { now: 'T' })

    expect(bundles).toHaveLength(CHUNK_COUNT)
    expect(CHUNK_COUNT).toBe(10)
  })

  it('assigns each number to the chunk for its hundreds digit', () => {
    expect(bundleIdFor('000')).toBe('chunk_0')
    expect(bundleIdFor('099')).toBe('chunk_0')
    expect(bundleIdFor('100')).toBe('chunk_1')
    expect(bundleIdFor('999')).toBe('chunk_9')
  })

  it('the union of all chunks equals the input, with no gaps or duplicates', () => {
    const bundles = buildAllBundles(allDocs, { now: 'T' })
    const merged = mergeBundles(bundles)

    expect(merged).toHaveLength(1000)
    expect(new Set(merged.map((d) => d.num)).size).toBe(1000)
    expect(merged.map((d) => d.num)).toEqual(allDocs.map((d) => d.num))
  })

  it('REQ-BND-001: rebuilding one chunk only touches that range', () => {
    const chunk = buildBundle('chunk_3', allDocs, { now: 'T' })

    expect(chunk.numbers).toHaveLength(BUNDLE_SIZE)
    expect(chunk.numbers[0].num).toBe('300')
    expect(chunk.numbers.at(-1).num).toBe('399')
  })

  it('REQ-BND-002: every chunk carries builtAt', () => {
    const chunk = buildBundle('chunk_0', allDocs, {
      now: '2026-08-20T00:00:00.000Z',
    })

    expect(chunk.builtAt).toBe('2026-08-20T00:00:00.000Z')
    expect(chunk.id).toBe('chunk_0')
  })

  it('REQ-BND-003: refuses to build a chunk that would exceed the document limit', () => {
    const fat = allDocs
      .slice(0, 100)
      .map((d) => ({ ...d, blob: 'x'.repeat(20000) }))

    expect(() => buildBundle('chunk_0', fat, { now: 'T' })).toThrow(/too large/)
  })

  it('keeps a real 100-number chunk far below the limit', () => {
    const chunk = buildBundle('chunk_0', allDocs, { now: 'T' })
    const bytes = Buffer.byteLength(JSON.stringify(chunk))

    expect(bytes).toBeLessThan(1024 * 1024)
  })

  it('tolerates a sparse range without inventing entries', () => {
    const sparse = [docFor('500'), docFor('507')]
    const chunk = buildBundle('chunk_5', sparse, { now: 'T' })

    expect(chunk.numbers.map((d) => d.num)).toEqual(['500', '507'])
  })

  it('rejects an unknown chunk id instead of silently returning empty', () => {
    expect(() => buildBundle('chunk_10', allDocs, { now: 'T' })).toThrow(
      /unknown chunk/
    )
    expect(() => bundleIdFor('1000')).toThrow(/invalid num/)
  })
})
