import { describe, expect, it } from 'vitest'
import {
  availableSlots,
  defaultOrder,
  isAutoConfirmed,
  resolveOrder,
  resolveRatings,
  setRep,
  setScore,
} from '../rep-store.js'

const word = {
  num: '051',
  wh1: '鯉',
  wh1k: 'こい',
  wh2: '子犬',
  wh2k: 'こいぬ',
  wm1: 'コイン',
  wm1k: 'こいん',
}

describe('representative word store', () => {
  it('design:representative-store: lists only readable candidate slots', () => {
    expect(availableSlots(word)).toEqual(['wh1', 'wh2', 'wm1'])
  })

  it('uses person-first/object-first default priority with a max of two', () => {
    expect(defaultOrder(word)).toEqual(['wh1', 'wm1'])
  })

  it('auto-confirms exactly one candidate, not zero or multiple candidates', () => {
    expect(isAutoConfirmed({ wh1k: 'ひとり' })).toBe(true)
    expect(isAutoConfirmed({})).toBe(false)
    expect(isAutoConfirmed(word)).toBe(false)
  })

  it('resolves saved picks by value after source slots are reordered', () => {
    const reordered = {
      ...word,
      wh1: '子犬',
      wh1k: 'こいぬ',
      wh2: '鯉',
      wh2k: 'こい',
    }

    expect(
      resolveOrder(reordered, {
        picks: [
          { k: 'こい', w: '鯉' },
          { k: 'こいん', w: 'コイン' },
        ],
      })
    ).toEqual({ order: ['wh2', 'wm1'], stale: [] })
  })

  it('keeps deleted or changed picks stale instead of substituting a word', () => {
    const missing = { k: 'さかな', w: '魚' }

    expect(resolveOrder(word, { picks: [missing] })).toEqual({
      order: [],
      stale: [missing],
    })
  })

  it('REQ-REP-002: preserves an explicitly empty representative order', () => {
    expect(resolveOrder(word, { picks: [] })).toEqual({ order: [], stale: [] })
  })

  it('REQ-REP-002: writes an immutable, deduplicated representative update', () => {
    const store = Object.freeze({
      version: 1,
      rep: Object.freeze({ '001': Object.freeze({ confirmed: true }) }),
    })
    let written

    const result = setRep(
      { num: '051', order: ['wh1', 'wh1', 'wm1'], confirmed: true },
      {
        loadStore: () => store,
        loadWords: () => [word],
        writeStore: (next) => {
          written = next
        },
      }
    )

    expect(result).toEqual({
      num: '051',
      order: ['wh1', 'wm1'],
      confirmed: true,
    })
    expect(written).not.toBe(store)
    expect(written.rep).not.toBe(store.rep)
    expect(store).toEqual({
      version: 1,
      rep: { '001': { confirmed: true } },
    })
    // 書き込みでは現行スキーマ版に揃える (scores 導入で v2)
    expect(written.version).toBe(2)
  })

  it('REQ-REP-002: persists an explicit empty order without defaults', () => {
    let written
    const result = setRep(
      { num: '051', order: [], confirmed: false },
      {
        loadStore: () => ({ version: 1, rep: {} }),
        loadWords: () => [word],
        writeStore: (next) => {
          written = next
        },
      }
    )

    expect(result.order).toEqual([])
    expect(written.rep['051'].picks).toEqual([])
  })

  it('REQ-REP-007: rates a candidate by value and keeps other ratings', () => {
    let written
    const result = setScore(
      { num: '051', slot: 'wm1', v: 2 },
      {
        loadStore: () => ({
          version: 2,
          rep: {},
          scores: { '051': [{ k: 'こい', w: '鯉', v: -1 }] },
        }),
        loadWords: () => [word],
        writeStore: (next) => {
          written = next
        },
      }
    )

    expect(result).toMatchObject({ num: '051', slot: 'wm1', v: 2 })
    expect(written.scores['051']).toEqual([
      { k: 'こい', w: '鯉', v: -1 },
      { k: 'こいん', w: 'コイン', v: 2 },
    ])
  })

  it('REQ-REP-007: replaces the rating of the same word instead of appending', () => {
    let written
    setScore(
      { num: '051', slot: 'wh1', v: 1 },
      {
        loadStore: () => ({
          version: 2,
          rep: {},
          scores: { '051': [{ k: 'こい', w: '鯉', v: -1 }] },
        }),
        loadWords: () => [word],
        writeStore: (next) => {
          written = next
        },
      }
    )

    expect(written.scores['051']).toEqual([{ k: 'こい', w: '鯉', v: 1 }])
  })

  it('REQ-REP-007: clears a rating with null and drops the empty entry', () => {
    let written
    const result = setScore(
      { num: '051', slot: 'wh1', v: null },
      {
        loadStore: () => ({
          version: 2,
          rep: {},
          scores: { '051': [{ k: 'こい', w: '鯉', v: -1 }] },
        }),
        loadWords: () => [word],
        writeStore: (next) => {
          written = next
        },
      }
    )

    expect(result.v).toBe(null)
    expect(written.scores['051']).toBeUndefined()
  })

  it('REQ-REP-007: distinguishes an unrated candidate from a zero rating', () => {
    const { rates } = resolveRatings(word, [{ k: 'こい', w: '鯉', v: 0 }])

    expect(rates.wh1).toBe(0)
    expect('wm1' in rates).toBe(false)
  })

  it('REQ-REP-007: keeps ratings of deleted words stale instead of shifting them', () => {
    const gone = { k: 'さかな', w: '魚', v: 2 }

    expect(resolveRatings(word, [gone])).toEqual({ rates: {}, stale: [gone] })
  })

  it('REQ-REP-007: rejects an out-of-range rating without writing', () => {
    const writeStore = () => {
      throw new Error('must not write')
    }

    expect(
      setScore(
        { num: '051', slot: 'wh1', v: 3 },
        {
          loadStore: () => ({ scores: {} }),
          loadWords: () => [word],
          writeStore,
        }
      )
    ).toEqual({ error: 'invalid rating' })
  })

  it('REQ-REP-003: rejects unavailable slots without writing', () => {
    const writeStore = () => {
      throw new Error('must not write')
    }

    expect(
      setRep(
        { num: '051', order: ['wh3'], confirmed: true },
        {
          loadStore: () => ({ version: 1, rep: {} }),
          loadWords: () => [word],
          writeStore,
        }
      )
    ).toEqual({ error: 'order contains unavailable slot' })
  })
})
