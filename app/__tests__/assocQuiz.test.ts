import { describe, it, expect } from 'vitest'
import { NumberEntrySchema, type NumberEntry } from '../data/schema'
import { makeRng } from '../lib/kukuQuiz'
import {
  assocPool,
  pickWordDistractors,
  buildAssocQuestion,
  buildAssocQuiz,
} from '../lib/assocQuiz'

/** wh1 に語を持つ最小の NumberEntry を作る(空欄は語なし扱い) */
const entry = (num: string, wh1: string, wh1k = ''): NumberEntry =>
  NumberEntrySchema.parse({ num, wh1, wh1k })

const ENTRIES: NumberEntry[] = [
  entry('101', 'いちおう', 'イチオウ'),
  entry('202', 'にわとり'),
  entry('303', 'みみ'),
  entry('404', 'よれよれ'),
  entry('505', 'ゴーゴー'),
  entry('606', '', ''), // 語なし → プールから除外
]

describe('assocPool', () => {
  it('語を持つ entry だけを num→word に落とす', () => {
    const pool = assocPool(ENTRIES)
    expect(pool).toHaveLength(5)
    expect(pool.map((p) => p.num)).not.toContain('606')
    expect(pool[0]).toEqual({ num: '101', word: 'いちおう' })
  })
})

describe('pickWordDistractors', () => {
  it('正解語を含まず、一意で指定数を返す', () => {
    const pool = assocPool(ENTRIES)
    const ds = pickWordDistractors(pool[0], pool, 3, makeRng(42))
    expect(ds).toHaveLength(3)
    expect(ds).not.toContain('いちおう')
    expect(new Set(ds).size).toBe(3)
  })

  it('pool が少なければ取れる分だけ返す', () => {
    const pool = assocPool(ENTRIES).slice(0, 2)
    const ds = pickWordDistractors(pool[0], pool, 3, makeRng(1))
    expect(ds).toEqual(['にわとり'])
  })
})

describe('buildAssocQuestion', () => {
  it('prompt は番号、answer は語、choices は answer を含み bmKey を持つ', () => {
    const pool = assocPool(ENTRIES)
    const q = buildAssocQuestion(pool[0], pool, makeRng(3), 4)
    expect(q.prompt).toBe('101')
    expect(q.answer).toBe('いちおう')
    expect(q.choices).toHaveLength(4)
    expect(q.choices).toContain('いちおう')
    expect(new Set(q.choices).size).toBe(4)
    expect(q.bmKey).toBe('n:101')
  })
})

describe('buildAssocQuiz', () => {
  it('count 問を作り、各設問の正解は choices に含まれる', () => {
    const quiz = buildAssocQuiz(assocPool(ENTRIES), 4, makeRng(9))
    expect(quiz).toHaveLength(4)
    for (const q of quiz) {
      expect(q.choices).toContain(q.answer)
      expect(q.bmKey).toBe('n:' + q.prompt)
    }
  })

  it('pool 数を超える count はクランプされる', () => {
    const quiz = buildAssocQuiz(assocPool(ENTRIES), 100, makeRng(2))
    expect(quiz).toHaveLength(5)
  })

  it('同じ seed なら決定的', () => {
    const pool = assocPool(ENTRIES)
    expect(buildAssocQuiz(pool, 3, makeRng(5))).toEqual(
      buildAssocQuiz(pool, 3, makeRng(5))
    )
  })
})
