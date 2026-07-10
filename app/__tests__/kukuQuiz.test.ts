import { describe, it, expect } from 'vitest'
import {
  exprLeft,
  shuffle,
  pickDistractors,
  buildQuestion,
  buildQuiz,
  makeRng,
  type KukuItem,
} from '../lib/kukuQuiz'

const item = (expr: string, prob: string, tier = 'mid'): KukuItem => ({
  tier,
  expr,
  label: 'JI',
  yomi: prob + 'x',
  prob,
})

const POOL: KukuItem[] = [
  item('44x4=176', 'しょんし'),
  item('51x2=102', 'こいんに'),
  item('52x2=104', 'こにんに'),
  item('74x6=444', 'にょんろ'),
  item('12x2=024', 'てぃんに'),
  item('25x4=100', 'にこんし'),
]

describe('exprLeft', () => {
  it('左辺のみ × 表記にする', () => {
    expect(exprLeft('44x4=176')).toBe('44×4')
    expect(exprLeft('99x9=891')).toBe('99×9')
  })
})

describe('shuffle', () => {
  it('元配列を破壊せず、同じ要素集合を返す', () => {
    const src = [1, 2, 3, 4, 5]
    const out = shuffle(src, makeRng(1))
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('pickDistractors', () => {
  it('answer を含まず、指定数を返す', () => {
    const target = POOL[0] // しょんし
    const ds = pickDistractors(target, POOL, 3, makeRng(42))
    expect(ds).toHaveLength(3)
    expect(ds).not.toContain('しょんし')
    expect(new Set(ds).size).toBe(3) // 一意
  })

  it('同じ文字数の読みを優先する', () => {
    // しょんし=4文字。同4文字を優先採用
    const target = POOL[0]
    const ds = pickDistractors(target, POOL, 2, makeRng(7))
    for (const d of ds) expect([...d].length).toBe(4)
  })

  it('pool が少なければ取れる分だけ返す', () => {
    const small = [POOL[0], POOL[1]]
    const ds = pickDistractors(POOL[0], small, 3, makeRng(1))
    expect(ds).toEqual(['こいんに'])
  })
})

describe('buildQuestion', () => {
  it('choices は answer を含む4択で一意', () => {
    const q = buildQuestion(POOL[0], POOL, makeRng(3), 4)
    expect(q.answer).toBe('しょんし')
    expect(q.left).toBe('44×4')
    expect(q.choices).toHaveLength(4)
    expect(q.choices).toContain('しょんし')
    expect(new Set(q.choices).size).toBe(4)
  })
})

describe('buildQuiz', () => {
  it('count 問を作り、各設問の正解は choices に含まれる', () => {
    const quiz = buildQuiz(POOL, 4, makeRng(9))
    expect(quiz).toHaveLength(4)
    for (const q of quiz) {
      expect(q.choices).toContain(q.answer)
      expect(q.choices).toHaveLength(4)
    }
  })

  it('items 数を超える count はクランプされる', () => {
    const quiz = buildQuiz(POOL, 100, makeRng(2))
    expect(quiz).toHaveLength(POOL.length)
  })

  it('同じ seed なら決定的', () => {
    const a = buildQuiz(POOL, 3, makeRng(5))
    const b = buildQuiz(POOL, 3, makeRng(5))
    expect(a).toEqual(b)
  })
})
