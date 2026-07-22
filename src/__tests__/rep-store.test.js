import { describe, expect, it } from 'vitest'
import {
  availableSlots,
  defaultOrder,
  isAutoConfirmed,
  resolveOrder,
  setRep,
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
