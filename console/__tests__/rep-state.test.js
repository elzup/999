import { describe, expect, it } from 'vitest'
import { applySavedRep } from '../rep-state.js'

const state = {
  words: [
    {
      num: '051',
      order: ['wh1'],
      confirmed: false,
      stale: [{ k: 'old', w: 'old' }],
    },
  ],
}

describe('representative console client state', () => {
  it('REQ-REP-006: applies only the order and confirmation returned by success', () => {
    const next = applySavedRep(state, '051', {
      order: ['wm1', 'wh1'],
      confirmed: true,
    })

    expect(next).toEqual({
      words: [
        {
          num: '051',
          order: ['wm1', 'wh1'],
          confirmed: true,
          stale: [],
        },
      ],
    })
    expect(next).not.toBe(state)
    expect(next.words).not.toBe(state.words)
    expect(state.words[0].order).toEqual(['wh1'])
  })

  it('REQ-REP-006: keeps state unchanged after a failed save', () => {
    expect(applySavedRep(state, '051', { error: 'invalid' })).toBe(state)
  })
})
