import { describe, expect, it } from 'vitest'
import {
  MAX_DOC_BYTES,
  assertPreserves,
  buildNumberDoc,
  canonicalJson,
  docSizeBytes,
  validateNumberDoc,
} from '../firestore/number-doc.js'

const now = '2026-08-20T00:00:00.000Z'

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

const rep = { picks: [{ k: 'こい', w: '鯉' }], confirmed: true }
const ratings = [{ k: 'こい', w: '鯉', v: 2 }]
const build = (over = {}) =>
  buildNumberDoc({ word, source: 'sheet', now, ...over })

describe('firestore number document', () => {
  it('REQ-FS-001: stamps updatedAt and source on every write', () => {
    const doc = build()

    expect(doc.source).toBe('sheet')
    expect(doc.updatedAt).toBe(now)
  })

  it('REQ-FS-001: refuses to guess the timestamp', () => {
    // 既定で new Date() を入れると «同じ入力 -> 同じ文書» が言えなくなる
    expect(() => buildNumberDoc({ word, source: 'sheet' })).toThrow(
      /now is required/
    )
  })

  it('REQ-FS-002: rejects a document whose id does not match num', () => {
    const doc = build()

    expect(validateNumberDoc('051', doc).ok).toBe(true)
    expect(validateNumberDoc('052', doc)).toMatchObject({
      error: 'id mismatch',
    })
  })

  it('REQ-FS-003: rejects a rating outside -1/0/1/2', () => {
    const doc = build({ ratings: [{ k: 'こい', w: '鯉', v: 3 }] })

    expect(validateNumberDoc('051', doc)).toMatchObject({
      error: 'invalid rating',
    })
  })

  it('REQ-FS-003: accepts every allowed rating including 0', () => {
    for (const v of [-1, 0, 1, 2]) {
      expect(
        validateNumberDoc(
          '051',
          build({ ratings: [{ k: 'こい', w: '鯉', v }] })
        ).ok
      ).toBe(true)
    }
  })

  it('REQ-FS-004: rejects three or more representative picks', () => {
    const doc = build({
      rep: {
        picks: [
          { k: 'a', w: 'A' },
          { k: 'b', w: 'B' },
          { k: 'c', w: 'C' },
        ],
        confirmed: true,
      },
    })

    expect(validateNumberDoc('051', doc)).toMatchObject({
      error: 'too many picks',
    })
  })

  it('REQ-FS-005: the mandatory gate itself rejects derived', () => {
    // 以前は validateClientWrite という別関数に分けていたため、
    // spec が «必ず通す» と定めた validateNumberDoc は derived を素通ししていた
    expect(
      validateNumberDoc('051', { ...build(), derived: { ptBySlot: {} } })
    ).toMatchObject({
      error: 'derived is server-owned',
    })
  })

  it('REQ-FS-009: omits rep and ratings instead of emptying them', () => {
    // 既定で rep: null を入れると «消去» がこの関数の既定動作になる
    const doc = build()

    expect('rep' in doc).toBe(false)
    expect('ratings' in doc).toBe(false)
  })

  it('REQ-FS-008: refuses a write that would drop an existing rep', () => {
    const current = { rep, ratings }

    expect(assertPreserves(current, build())).toMatchObject({
      error: 'rep would be dropped',
    })
    expect(assertPreserves(current, build({ rep, ratings })).ok).toBe(true)
  })

  it('REQ-FS-008: refuses a write that would overwrite ratings', () => {
    const current = { ratings }
    const clobbered = build({ ratings: [{ k: 'こい', w: '鯉', v: -1 }] })

    expect(assertPreserves(current, clobbered)).toMatchObject({
      error: 'ratings would be overwritten',
    })
  })

  it('REQ-FS-008: is not fooled by field order coming back from Firestore', () => {
    const current = {
      rep: { confirmed: true, picks: [{ w: '鯉', k: 'こい' }] },
    }

    expect(assertPreserves(current, build({ rep })).ok).toBe(true)
  })

  it('REQ-FS-010: returns an error instead of throwing on null entries', () => {
    const base = { num: '051', source: 'app', slots: {} }

    expect(
      validateNumberDoc('051', { ...base, rep: { picks: [null] } })
    ).toMatchObject({
      error: 'pick entry must be an object',
    })
    expect(
      validateNumberDoc('051', { ...base, ratings: [null] })
    ).toMatchObject({
      error: 'rating entry must be an object',
    })
  })

  it('does not collide on values that share a separator', () => {
    // {k:'あ い',w:'X'} と {k:'あ',w:'い X'} は別物
    const doc = build({
      rep: {
        picks: [
          { k: 'あ い', w: 'X' },
          { k: 'あ', w: 'い X' },
        ],
        confirmed: false,
      },
    })

    expect(validateNumberDoc('051', doc).ok).toBe(true)
  })

  it('detects a duplicate that differs only by unicode normalization', () => {
    const doc = build({
      ratings: [
        { k: 'が', w: 'A', v: 1 },
        { k: 'が'.normalize('NFD'), w: 'A', v: 2 },
      ],
    })

    expect(validateNumberDoc('051', doc)).toMatchObject({
      error: 'duplicate rating',
    })
  })

  it('validates the shape of slots rather than trusting them', () => {
    const base = { num: '051', source: 'app' }

    expect(
      validateNumberDoc('051', {
        ...base,
        slots: { zzz: { word: '', kana: '', imageUrl: '' } },
      })
    ).toMatchObject({ error: 'unknown slot: zzz' })
    expect(
      validateNumberDoc('051', { ...base, slots: { wh1: { word: 1 } } })
    ).toMatchObject({ error: 'slot wh1.word must be a string' })
    expect(validateNumberDoc('051', { ...base, slots: 'nope' })).toMatchObject({
      error: 'slots must be an object',
    })
  })

  it('rejects a rep that is present but malformed', () => {
    const base = { num: '051', source: 'app', slots: {} }

    expect(validateNumberDoc('051', { ...base, rep: 'oops' })).toMatchObject({
      error: 'rep must be an object',
    })
    expect(
      validateNumberDoc('051', { ...base, rep: { confirmed: true } })
    ).toMatchObject({ error: 'picks must be an array' })
  })

  it('maps every filled slot and drops empty ones', () => {
    const doc = build()

    expect(Object.keys(doc.slots)).toEqual(['wh1', 'wm1'])
    expect(doc.slots.wh1).toEqual({
      word: '鯉',
      kana: 'こい',
      imageUrl: 'https://example.test/koi.webp',
    })
    expect(doc.slots.wm1.imageUrl).toBe('')
  })

  it('canonicalJson ignores key order but respects array order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })

  it('counts size with overhead and rejects at the boundary', () => {
    const fat = { ...build(), blob: 'x'.repeat(MAX_DOC_BYTES) }

    expect(docSizeBytes(build())).toBeLessThan(MAX_DOC_BYTES / 100)
    expect(validateNumberDoc('051', fat)).toMatchObject({
      error: 'document too large',
    })
  })
})
