import { describe, it, expect } from 'vitest'
import { parseCardsTsv } from '../data/parse'

const SAMPLE_TSV = [
  'mark\tA\tI\tU',
  '♠️A\t紗枝\t支援\tsue',
  '♠️2\tサブ\tジブ\tスニ,スプー',
  '♥️K\t派遣\t\tバケツ',
  '♣️J\tクリスタ\t\t栗',
  '♦️10\ttad\t\tタトゥー',
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

  it('parses A/I/U columns', () => {
    expect(cards[0]).toMatchObject({ a: '紗枝', i: '支援', u: 'sue' })
    expect(cards[1]).toMatchObject({ a: 'サブ', i: 'ジブ', u: 'スニ,スプー' })
  })

  it('defaults empty columns to empty string', () => {
    expect(cards[2].i).toBe('')
  })

  it('skips rows with invalid mark', () => {
    const tsv = 'mark\tA\tI\tU\nXX\ttest\t\t'
    expect(parseCardsTsv(tsv)).toHaveLength(0)
  })

  it('handles variant suit emojis without variation selector', () => {
    const tsv = 'mark\tA\tI\tU\n♠A\ttest\t\t'
    const result = parseCardsTsv(tsv)
    expect(result).toHaveLength(1)
    expect(result[0].suit).toBe('S')
  })
})
