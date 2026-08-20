import { describe, expect, it } from 'vitest'
import {
  MAX_DOC_BYTES,
  buildNumberDoc,
  docSizeBytes,
  validateClientWrite,
  validateNumberDoc,
} from '../firestore/number-doc.js'

const word = {
  num: '051',
  hito: '鯉',
  mono: 'コイン',
  wh1: '鯉',
  wh1k: 'こい',
  wh1Img: 'https://example.test/koi.webp',
  wm1: 'コイン',
  wm1k: 'こいん',
}

const rep = {
  picks: [{ k: 'こい', w: '鯉' }],
  confirmed: true,
}

const ratings = [{ k: 'こい', w: '鯉', v: 2 }]

describe('firestore number document', () => {
  it('REQ-FS-001: stamps updatedAt and source on every write', () => {
    const doc = buildNumberDoc({
      word,
      source: 'sheet',
      now: '2026-08-20T00:00:00.000Z',
    })

    expect(doc.source).toBe('sheet')
    expect(doc.updatedAt).toBe('2026-08-20T00:00:00.000Z')
  })

  it('REQ-FS-002: rejects a document whose id does not match num', () => {
    const doc = buildNumberDoc({ word, source: 'sheet' })

    expect(validateNumberDoc('051', doc).ok).toBe(true)
    expect(validateNumberDoc('052', doc)).toMatchObject({
      error: 'id mismatch',
    })
  })

  it('REQ-FS-003: rejects a rating outside -1/0/1/2', () => {
    const doc = buildNumberDoc({
      word,
      ratings: [{ k: 'こい', w: '鯉', v: 3 }],
      source: 'console',
    })

    expect(validateNumberDoc('051', doc)).toMatchObject({
      error: 'invalid rating',
    })
  })

  it('REQ-FS-003: accepts every allowed rating including 0', () => {
    for (const v of [-1, 0, 1, 2]) {
      const doc = buildNumberDoc({
        word,
        ratings: [{ k: 'こい', w: '鯉', v }],
        source: 'console',
      })
      expect(validateNumberDoc('051', doc).ok).toBe(true)
    }
  })

  it('REQ-FS-004: rejects three or more representative picks', () => {
    const doc = buildNumberDoc({
      word,
      rep: {
        picks: [
          { k: 'a', w: 'A' },
          { k: 'b', w: 'B' },
          { k: 'c', w: 'C' },
        ],
        confirmed: true,
      },
      source: 'console',
    })

    expect(validateNumberDoc('051', doc)).toMatchObject({
      error: 'too many picks',
    })
  })

  it('REQ-FS-005: rejects a client write that carries derived', () => {
    const doc = buildNumberDoc({ word, source: 'app' })
    const withDerived = { ...doc, derived: { ptBySlot: { wh1: 3 } } }

    expect(validateClientWrite(withDerived)).toMatchObject({
      error: 'derived is server-owned',
    })
    expect(validateClientWrite(doc).ok).toBe(true)
  })

  it('carries the representative and ratings through unchanged', () => {
    const doc = buildNumberDoc({ word, rep, ratings, source: 'console' })

    expect(doc.rep).toEqual(rep)
    expect(doc.ratings).toEqual(ratings)
  })

  it('maps every filled slot and drops empty ones', () => {
    const doc = buildNumberDoc({ word, source: 'sheet' })

    expect(Object.keys(doc.slots)).toEqual(['wh1', 'wm1'])
    expect(doc.slots.wh1).toEqual({
      word: '鯉',
      kana: 'こい',
      imageUrl: 'https://example.test/koi.webp',
    })
    expect(doc.slots.wm1.imageUrl).toBe('')
  })

  it('never emits derived from the builder (server owns it)', () => {
    const doc = buildNumberDoc({ word, source: 'sheet' })

    expect('derived' in doc).toBe(false)
  })

  it('stays well under the 1 MiB document limit', () => {
    const doc = buildNumberDoc({ word, rep, ratings, source: 'sheet' })

    expect(docSizeBytes(doc)).toBeLessThan(MAX_DOC_BYTES / 100)
  })
})
