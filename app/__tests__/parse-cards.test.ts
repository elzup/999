import { describe, it, expect } from 'vitest'
import { parseCardsTsv } from '../data/parse'

const SAMPLE_TSV = [
  'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a',
  'A♠️\tエスピー\t夢のぞく\t3\t\t\t\tS評価\t2',
  '2♠️\t\t\t\tニス\t塗る\t3\tニス塗る\t1',
  'K♥️\t\t\t\t\t\t\t\t',
  'J♣️\tリク\t\t2\t\t\t\t\t',
  '10♦️\t戸田\t\t3\t\t\t\ttad\t1',
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

  it('parses PAO fields with action_p and action_o', () => {
    expect(cards[0]).toMatchObject({
      person: 'エスピー',
      actionP: '夢のぞく',
      personScore: 3,
      action: 'S評価',
      actionScore: 2,
    })
    expect(cards[1]).toMatchObject({
      object: 'ニス',
      actionO: '塗る',
      objectScore: 3,
      action: 'ニス塗る',
      actionScore: 1,
    })
  })

  it('defaults empty columns', () => {
    expect(cards[2].person).toBe('')
    expect(cards[2].personScore).toBeNull()
    expect(cards[2].actionP).toBe('')
    expect(cards[2].object).toBe('')
  })

  it('skips rows with invalid mark', () => {
    const tsv = 'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a\nXX\ttest\t\t1\t\t\t\t\t'
    expect(parseCardsTsv(tsv)).toHaveLength(0)
  })

  it('handles variant suit emojis without variation selector', () => {
    const tsv = 'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a\nA♠\ttest\t\t1\t\t\t\t\t'
    const result = parseCardsTsv(tsv)
    expect(result).toHaveLength(1)
    expect(result[0].suit).toBe('S')
  })

  it('clamps score to max 3', () => {
    const tsv = 'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a\nA♠️\talpha\t\t9\t\t\t\t\t'
    const result = parseCardsTsv(tsv)
    expect(result[0].personScore).toBe(3)
  })
})
