import { describe, it, expect } from 'vitest'
import { parseCardsTsv } from '../data/parse'

const SAMPLE_TSV = [
  'mark\tfirst\tscore',
  'A♠️\tエスピー\t3',
  '2♠️\tニス\t3',
  'K♥️\t\t1',
  'J♣️\t\t',
  '10♦️\tタトゥー\t0',
].join('\n')

describe('parseCardsTsv', () => {
  const cards = parseCardsTsv(SAMPLE_TSV)

  it('parses all valid rows', () => {
    expect(cards).toHaveLength(5)
  })

  it('parses suit from mark emoji', () => {
    expect(cards[0].suit).toBe('S')
    expect(cards[2].suit).toBe('H')
    expect(cards[3].suit).toBe('C')
    expect(cards[4].suit).toBe('D')
  })

  it('parses rank from mark', () => {
    expect(cards[0].rank).toBe('A')
    expect(cards[1].rank).toBe('2')
    expect(cards[2].rank).toBe('K')
    expect(cards[4].rank).toBe('10')
  })

  it('parses first and score', () => {
    expect(cards[0]).toMatchObject({ first: 'エスピー', score: 3 })
    expect(cards[1]).toMatchObject({ first: 'ニス', score: 3 })
  })

  it('defaults empty columns', () => {
    expect(cards[2].first).toBe('')
    expect(cards[3].first).toBe('')
    expect(cards[3].score).toBeNull()
  })

  it('skips rows with invalid mark', () => {
    const tsv = 'mark\tfirst\tscore\nXX\ttest\t1'
    expect(parseCardsTsv(tsv)).toHaveLength(0)
  })

  it('handles variant suit emojis without variation selector', () => {
    const tsv = 'mark\tfirst\tscore\nA♠\ttest\t'
    const result = parseCardsTsv(tsv)
    expect(result).toHaveLength(1)
    expect(result[0].suit).toBe('S')
  })

  it('clamps score to max 3', () => {
    const tsv = 'mark\tfirst\tscore\nA♠️\talpha\t9'
    const result = parseCardsTsv(tsv)
    expect(result[0].score).toBe(3)
  })
})
