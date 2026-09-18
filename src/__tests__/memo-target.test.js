import { describe, expect, it } from 'vitest'
import {
  ROLES,
  baseName,
  buildWordIndex,
  collisions,
  entriesOfCard,
  entriesOfHex,
  entriesOfNumber,
  isUniqueLabel,
  normalizeLabel,
  targetId,
  targetsOf,
  toEntries,
} from '../data/memo-target.js'
import { containsJunk, isJunk } from '../data/junk.js'

const num = (over = {}) => ({ num: '573', w1: '', w1k: '', ...over })
const card = (over = {}) => ({ suit: 'S', rank: 'A', ...over })
const hex = (over = {}) => ({ hex: 'B3', word: '', kana: '', ...over })

describe('junk markers', () => {
  it('treats sheet error values as junk', () => {
    for (const value of ['', '—', '＿', '#REF!', '#N/A', 'FALSE', 'TRUE']) {
      expect(isJunk(value), value).toBe(true)
    }
  })

  it('keeps ordinary words', () => {
    for (const value of ['ナナミン', 'まお', '麻衣(先輩)']) {
      expect(isJunk(value), value).toBe(false)
      expect(containsJunk(value), value).toBe(false)
    }
  })

  it('finds a marker embedded in a concatenated reading', () => {
    // NC/CN は名前読みと参照読みを連結するので、欠損は語の途中に現れる
    expect(containsJunk('びーさん#REF!')).toBe(true)
    expect(containsJunk('—')).toBe(true)
  })

  it('only rejects FALSE / TRUE as the whole value', () => {
    expect(containsJunk('TRUE')).toBe(true)
    expect(containsJunk('TRUEな話')).toBe(false)
  })
})

describe('entries', () => {
  it('drops empty slots', () => {
    expect(entriesOfNumber(num())).toEqual([])
    expect(entriesOfCard(card())).toEqual([])
    expect(entriesOfHex(hex())).toEqual([])
  })

  it('reads every number slot role', () => {
    const entry = {
      num: '573',
      w1: '', // 本命が空でも候補は拾う
      wh1: '菜々緒',
      wh1k: 'ななお',
      wh1Img: 'a.png',
      wm2: 'ニス',
      wm2k: 'にす',
    }
    const roles = entriesOfNumber(entry).map((e) => e.role)
    expect(roles).toEqual(['wh1', 'wm2'])
    expect(entriesOfNumber(entry)[0]).toMatchObject({
      target: { kind: 'num', key: '573' },
      word: '菜々緒',
      kana: 'ななお',
      label: '菜々緒',
      imageUrl: 'a.png',
    })
    expect(ROLES.num).toContain('wh1')
  })

  it('reads the three card faces', () => {
    const entries = entriesOfCard(
      card({ person: 'エスピー', object: 'ニス', action: 'S評価' })
    )
    expect(entries.map((e) => e.role)).toEqual(['person', 'object', 'action'])
    expect(targetId(entries[0].target)).toBe('card:S-A')
  })

  it('prefers the kanji word over kana for hex', () => {
    expect(entriesOfHex(hex({ word: '麻衣', kana: 'まい' }))[0].label).toBe(
      '麻衣'
    )
    expect(entriesOfHex(hex({ kana: 'まお' }))[0].label).toBe('まお')
  })

  it('merges the three domains into one list', () => {
    const entries = toEntries({
      numbers: [num({ w1: 'ナナミン', w1k: 'ななみん' })],
      cards: [card({ person: 'エスピー' })],
      hex: [hex({ word: '麻衣' })],
    })
    expect(entries.map((e) => e.target.kind)).toEqual(['num', 'card', 'hex'])
  })
})

describe('baseName', () => {
  it('strips tags, aliases, suffixes and parenthetical notes', () => {
    expect(baseName('麻衣(先輩)')).toBe('麻衣')
    expect(baseName('菜々緒 #hito')).toBe('菜々緒')
    expect(baseName('ニス,ワックス')).toBe('ニス')
    expect(baseName('アリス -alt')).toBe('アリス')
  })

  it('normalizes labels for comparison', () => {
    expect(normalizeLabel('  まお  ')).toBe('まお')
  })
})

describe('word index (many-to-many)', () => {
  const entries = toEntries({
    numbers: [
      num({ num: '573', w1: 'ニス', w1k: 'にす' }),
      num({ num: '021', w1: 'マオ', w1k: 'まお' }),
    ],
    cards: [card({ suit: 'S', rank: '2', object: 'ニス' })],
    hex: [hex({ hex: '00', word: 'マオ' }), hex({ hex: 'A1', word: 'マオ' })],
  })
  const index = buildWordIndex(entries)

  it('maps one word to every target that uses it, across domains', () => {
    expect(targetsOf(index, 'ニス')).toEqual([
      { kind: 'num', key: '573' },
      { kind: 'card', key: 'S-2' },
    ])
  })

  it('keeps each target once even when several slots hold the word', () => {
    const doubled = buildWordIndex(
      entriesOfNumber(
        num({ num: '573', w1: 'ニス', w1k: 'にす', wh1: 'ニス', wh1k: 'にす' })
      )
    )
    expect(doubled.get('ニス')).toHaveLength(2)
    expect(targetsOf(doubled, 'ニス')).toEqual([{ kind: 'num', key: '573' }])
  })

  it('answers whether a reverse lookup is unambiguous', () => {
    expect(isUniqueLabel(index, 'マオ')).toBe(false) // 021 / 00 / A1
    expect(isUniqueLabel(index, 'あいす')).toBe(false) // 未使用
    expect(isUniqueLabel(buildWordIndex(entries), 'にす')).toBe(false)
  })

  it('reports collisions, worst first', () => {
    const found = collisions(index)
    expect(found.map((c) => c.label)).toEqual(['マオ', 'ニス'])
    expect(found[0].targets).toHaveLength(3)
    expect(found[1].targets.map((t) => t.kind)).toEqual(['num', 'card'])
  })

  it('has no collisions when every word is used once', () => {
    const clean = buildWordIndex(
      toEntries({
        numbers: [num({ w1: 'ナナミン' })],
        hex: [hex({ word: '麻衣' })],
      })
    )
    expect(collisions(clean)).toEqual([])
  })
})
