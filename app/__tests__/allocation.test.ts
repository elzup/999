import { describe, it, expect } from 'vitest'
import { buildAllocation } from '../lib/allocation'
import type { NumberEntry, GoroAlloc } from '../data/schema'

function mkNum(num: string, ga: GoroAlloc): NumberEntry {
  return {
    num,
    w1: '',
    w1k: '',
    w2: '',
    w2k: '',
    hito: '',
    mono: '',
    gainen: '',
    catScore: null,
    w1Score: null,
    w2Score: null,
    ga,
  }
}

const slot = (k: string, d: string) => ({ k, d })

const numbers: NumberEntry[] = [
  // tail 00
  mkNum('100', { t1: slot('ま', 'double'), t2: null, h1: null, h2: null }),
  mkNum('300', {
    t1: slot('れん', 'single'),
    t2: slot('おん', 'single'),
    h1: null,
    h2: null,
  }),
  mkNum('200', { t1: null, t2: null, h1: null, h2: null }),
  // head 20 (for XY_ test)
  mkNum('201', { t1: null, t2: null, h1: slot('ふん', 'double'), h2: null }),
]

describe('buildAllocation', () => {
  const alloc = buildAllocation(numbers)

  it('produces all 100 groups for each mode', () => {
    expect(Object.keys(alloc._YZ)).toHaveLength(100)
    expect(Object.keys(alloc.XY_)).toHaveLength(100)
    expect(Object.keys(alloc['XY+YZ'])).toHaveLength(100)
  })

  it('aggregates w1+w2 readings for the tail mode', () => {
    const yz00 = alloc._YZ['00']
    const byKey = Object.fromEntries(yz00.map((i) => [i.key, i]))
    expect(byKey['ま'].count).toBe(1)
    expect(byKey['れん'].count).toBe(1)
    expect(byKey['おん'].count).toBe(1)
  })

  it('marks same-digit different-kana readings as mix', () => {
    const yz00 = alloc._YZ['00']
    const ren = yz00.find((i) => i.key === 'れん')!
    expect(ren.kind).toBe('mix')
    const ma = yz00.find((i) => i.key === 'ま')!
    expect(ma.kind).toBe('double')
  })

  it('counts fully unregistered numbers as (none)', () => {
    const none = alloc._YZ['00'].find((i) => i.key === '(none)')!
    expect(none.count).toBe(1) // 200
  })

  it('uses head positions for XY_ mode', () => {
    const xy20 = alloc.XY_['20']
    const fun = xy20.find((i) => i.key === 'ふん')!
    expect(fun.count).toBe(1)
  })
})
