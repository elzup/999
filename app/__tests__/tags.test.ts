import { describe, expect, test } from 'vitest'
import { collectNumberTags, parseTaggedItems } from '../lib/tags'

describe('parseTaggedItems', () => {
  test('parses multiple tags in one label', () => {
    expect(parseTaggedItems('hoge#a#b')).toEqual([
      { label: 'hoge#a#b', base: 'hoge', tags: ['a', 'b'] },
    ])
  })

  test('parses comma separated labels', () => {
    expect(parseTaggedItems('真姫#ll,オンキ#shingetsu')).toEqual([
      { label: '真姫#ll', base: '真姫', tags: ['ll'] },
      { label: 'オンキ#shingetsu', base: 'オンキ', tags: ['shingetsu'] },
    ])
  })
})

describe('collectNumberTags', () => {
  test('collects tags from hito mono gainen', () => {
    const result = collectNumberTags([
      {
        num: '123',
        hito: '真姫#ll,オンキ#shingetsu',
        mono: '羽#a#b',
        gainen: '覚醒#mode',
        w1: '',
        w1k: '',
        w2: '',
        w2k: '',
        catScore: null,
        w1Score: null,
        w2Score: null,
      },
    ])

    expect(result.map((entry) => [entry.tag, entry.count])).toEqual([
      ['a', 1],
      ['b', 1],
      ['ll', 1],
      ['mode', 1],
      ['shingetsu', 1],
    ])
    expect(result.find((entry) => entry.tag === 'a')?.categories).toEqual({
      hito: 0,
      mono: 1,
      gainen: 0,
    })
  })
})
