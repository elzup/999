import { describe, expect, it } from 'vitest'
import {
  buildTargets,
  cardId,
  imageFieldsOf,
  kindOf,
} from '../images/targets.js'
import { parseCardsTsv } from '../cards-tsv.js'

describe('画像の対象 ID', () => {
  it('ID の形で種類が決まり、番号・日付・カードが衝突しない', () => {
    expect(kindOf('315')).toBe('num')
    expect(kindOf('1225')).toBe('date')
    expect(kindOf('AS')).toBe('card')
    expect(kindOf('10H')).toBe('card')
    expect(kindOf('SA')).toBe(null)
    expect(kindOf('12')).toBe(null)
    // 日付は 4 桁の 10〜12 月の実在日だけ (1〜9 月は 3 桁で番号と同じ)
    expect(kindOf('1015')).toBe('date')
    expect(kindOf('1131')).toBe(null)
    expect(kindOf('1132')).toBe(null)
  })

  it('カード ID はランク + スート (トランプの表記の順)', () => {
    expect(cardId({ suit: 'D', rank: 'Q' })).toBe('QD')
  })
})

describe('buildTargets', () => {
  it('番号・日付は旧スロットへ、カードは P/A/O へ寄せ、語の無い対象は捨てる', () => {
    const targets = buildTargets({
      words: [
        { num: '315', wh1: '才', wm1: '' },
        { num: '316', wh1: '', wm1: '' },
      ],
      dates: [
        { num: '1225', wh1: 'サンタ' },
        { num: '1132', wh1: '実在しない日' },
      ],
      cards: [
        { suit: 'S', rank: 'A', person: 'エスピー', action: '', object: '' },
      ],
    })
    expect(targets.map((t) => [t.kind, t.id])).toEqual([
      ['num', '315'],
      ['date', '1225'],
      ['card', 'AS'],
    ])
    expect(targets[0].w1).toBe('才')
    expect(targets[2].P).toBe('エスピー')
  })
})

describe('imageFieldsOf', () => {
  it('manifest の枠を配信データの画像列に写す', () => {
    const slots = { P: { url: 'p.webp' }, O: { url: '' }, w1: { url: 'x' } }
    expect(imageFieldsOf('card', slots)).toEqual({ personImg: 'p.webp' })
    expect(imageFieldsOf('date', { w1: { url: 'd.webp' } })).toEqual({
      w1Img: 'd.webp',
    })
    expect(imageFieldsOf('num', undefined)).toEqual({})
  })
})

describe('parseCardsTsv', () => {
  it('前後どちらのマークも読み、読めない行は onSkip に渡す', () => {
    const tsv = [
      'mark\tperson\taction_p\tscore_p\tobject\taction_o\tscore_o\taction\tscore_a',
      'A♠️\tエスピー\t夢のぞく\t3\t\t\t\tS評価\t2',
      '♦10\t\t\t\t鉄\t打つ\t5\t\t',
      '??\tx\t\t\t\t\t\t\t',
    ].join('\n')
    const skipped = []
    const cards = parseCardsTsv(tsv, (mark) => skipped.push(mark))
    expect(cards.map(cardId)).toEqual(['AS', '10D'])
    expect(cards[1].objectScore).toBe(3)
    expect(skipped).toEqual(['??'])
  })
})
