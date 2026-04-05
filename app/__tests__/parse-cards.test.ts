import { describe, it, expect } from 'vitest'
import { parseCardsTsv } from '../data/parse'

const SAMPLE_TSV = [
  'mark\tA\tB\tC\tD',
  '♠️A\t紗枝\t支援\t3\tsue',
  '♠️2\tサブ\tジブ\t2\tスニ,スプー',
  '♥️K\t派遣\t\t1\tバケツ',
  '♣️J\tクリスタ\t\t\t栗',
  '♦️10\ttad\t\t0\tタトゥー',
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

  it('parses A/B/C/D semantics', () => {
    expect(cards[0]).toMatchObject({ first: '支援', score: 3, secondary: 'sue' })
    expect(cards[1]).toMatchObject({ first: 'ジブ', score: 2, secondary: 'スニ,スプー' })
  })

  it('defaults empty columns to empty string', () => {
    expect(cards[2].first).toBe('')
    expect(cards[3].secondary).toBe('栗')
  })

  it('skips rows with invalid mark', () => {
    const tsv = 'mark\tA\tI\tU\nXX\ttest\t\t'
    expect(parseCardsTsv(tsv)).toHaveLength(0)
  })

  it('handles variant suit emojis without variation selector', () => {
    const tsv = 'mark\tA\tB\tC\tD\n♠A\ttest\t\t\t'
    const result = parseCardsTsv(tsv)
    expect(result).toHaveLength(1)
    expect(result[0].suit).toBe('S')
  })

  it('supports legacy I/U columns during transition', () => {
    const tsv = 'mark\tA\tI\tU\n♠️A\talpha\tbeta\tgamma'
    const result = parseCardsTsv(tsv)
    expect(result[0]).toMatchObject({ first: 'beta', score: null, secondary: 'gamma' })
  })

  it('clamps score to max 3', () => {
    const tsv = 'mark\tA\tB\tC\tD\n♠️A\talpha\tbeta\t9\tgamma'
    const result = parseCardsTsv(tsv)
    expect(result[0].score).toBe(3)
  })
})
