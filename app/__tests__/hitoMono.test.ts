import { describe, expect, test } from 'vitest'
import type { NumberEntry } from '../data/schema'
import {
  CATS,
  MIX_KINDS,
  SQUARE_SIDE,
  buildHitoMono,
  countCandidates,
  countEntry,
  mixOf,
  ratioOf,
  toVizzuSeries,
} from '../lib/hitoMono'

const entry = (num: string, part: Partial<NumberEntry> = {}): NumberEntry =>
  ({
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
    ...part,
  }) as NumberEntry

describe('countCandidates', () => {
  test('empty is 0', () => {
    expect(countCandidates('')).toBe(0)
  })

  test('counts comma separated candidates', () => {
    expect(countCandidates('ボブ,チャーリー')).toBe(2)
  })

  // "ニーナ#a,#b" は同じ候補にタグを足しているだけなので 1 件
  test('bare #tag continuation is the same candidate', () => {
    expect(countCandidates('ニーナ#ll,#res,#meme')).toBe(1)
  })

  test('dedupes the same base', () => {
    expect(countCandidates('犬#a,犬#b')).toBe(1)
  })
})

describe('countEntry', () => {
  test('main caps each category at 1, all counts everything', () => {
    const e = entry('001', {
      hito: 'ボブ,チャーリー',
      mono: '犬',
      gainen: '',
    })
    expect(countEntry(e)).toEqual({
      main: { hito: 1, mono: 1, gainen: 0 },
      all: { hito: 2, mono: 1, gainen: 0 },
    })
  })
})

describe('mixOf', () => {
  test.each([
    [{ hito: 0, mono: 0, gainen: 3 }, 'none'],
    [{ hito: 2, mono: 0, gainen: 0 }, 'hito'],
    [{ hito: 0, mono: 1, gainen: 0 }, 'mono'],
    [{ hito: 3, mono: 1, gainen: 0 }, 'hitoLean'],
    [{ hito: 1, mono: 3, gainen: 0 }, 'monoLean'],
    [{ hito: 2, mono: 2, gainen: 0 }, 'even'],
  ])('%o -> %s', (counts, expected) => {
    expect(mixOf(counts)).toBe(expected)
  })
})

describe('buildHitoMono', () => {
  const stats = buildHitoMono([
    entry('000', { hito: 'アリス', gainen: '例' }),
    entry('001', { hito: 'ボブ,チャーリー', mono: '犬', gainen: '数' }),
    entry('002', { mono: '猫,鳥', gainen: '空' }),
  ])

  test('always fills all 1000 cells', () => {
    expect(stats.cells).toHaveLength(1000)
    expect(stats.cells[0].num).toBe('000')
    expect(stats.cells[999].num).toBe('999')
  })

  test('missing numbers fall into none', () => {
    expect(stats.cells[500].mixMain).toBe('none')
    expect(stats.cells[500].all).toEqual({ hito: 0, mono: 0, gainen: 0 })
  })

  test('cube coordinates are the three digits', () => {
    const c = stats.cells[345]
    expect([c.h, c.t, c.o]).toEqual([3, 4, 5])
  })

  test('square coordinates wrap at 32', () => {
    expect(stats.cells[31]).toMatchObject({ sqCol: 31, sqRow: 0 })
    expect(stats.cells[32]).toMatchObject({ sqCol: 0, sqRow: 1 })
    expect(stats.cells[999]).toMatchObject({ sqCol: 999 % 32, sqRow: 31 })
    expect(SQUARE_SIDE * SQUARE_SIDE).toBeGreaterThanOrEqual(1000)
  })

  test('totals differ between main and all', () => {
    expect(stats.totals.main).toEqual({ hito: 2, mono: 2, gainen: 3 })
    expect(stats.totals.all).toEqual({ hito: 3, mono: 3, gainen: 3 })
  })

  test('mix counts cover every cell', () => {
    for (const mode of ['main', 'all'] as const) {
      const sum = MIX_KINDS.reduce((s, k) => s + stats.mixCounts[mode][k], 0)
      expect(sum).toBe(1000)
    }
    expect(stats.mixCounts.main.hito).toBe(1) // 000 は人のみ
    expect(stats.mixCounts.main.even).toBe(1) // 001 は 人1 = モノ1
    expect(stats.mixCounts.all.hitoLean).toBe(1) // 001 は 人2 > モノ1
  })
})

describe('ratioOf', () => {
  test('percentages sum to 100', () => {
    const r = ratioOf({ hito: 1, mono: 2, gainen: 1 })
    expect(r).toEqual({ hito: 25, mono: 50, gainen: 25 })
  })

  test('all zero stays zero', () => {
    expect(ratioOf({ hito: 0, mono: 0, gainen: 0 })).toEqual({
      hito: 0,
      mono: 0,
      gainen: 0,
    })
  })
})

describe('toVizzuSeries', () => {
  const stats = buildHitoMono([entry('001', { hito: 'ボブ,チャーリー' })])
  const series = toVizzuSeries(stats)

  test('every series has one value per (number × category)', () => {
    for (const s of series) {
      expect(s.values).toHaveLength(1000 * CATS.length)
    }
  })

  test('dimension categories are declared explicitly so colors stay pinned', () => {
    const mix = series.find((s) => s.name === '構成(全候補)')
    expect(mix).toMatchObject({ type: 'dimension' })
    expect(mix && 'categories' in mix && mix.categories).toHaveLength(
      MIX_KINDS.length
    )
  })

  test('measures keep main and all apart', () => {
    const main = series.find((s) => s.name === '件数(メイン)')!
    const all = series.find((s) => s.name === '件数(全候補)')!
    // 001 の人カテゴリは 3 レコード目 (index 3)
    expect(main.values[3]).toBe(1)
    expect(all.values[3]).toBe(2)
  })
})
