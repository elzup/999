import { describe, it, expect } from 'vitest'
import type { NumberEntry, RulesData } from '../data/schema'
import {
  buildYomiItems,
  buildYomiQuestions,
  buildYomiWordQuestions,
  yomiWordPool,
  filterScope,
  shuffle,
  usageNote,
} from '../lib/yomiDrill'

/** かな → 割当先。テストでは既定で本命語 (w1) を根拠にする */
const use = (...nums: string[]) =>
  nums.map((num) => ({ num, slot: 'w1' as const }))

const emptyMatrix = () =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )

function makeRules(): RulesData {
  const doubleMatrix = emptyMatrix()
  doubleMatrix[2][8] = ['ちゃ', 'つぁ']
  doubleMatrix[0][0] = ['ま'] // 1文字は2文字読みではない
  const longMatrix = emptyMatrix()
  longMatrix[9][8] = ['かー']
  return { singleByDigit: {}, doubleMatrix, longMatrix, weights: {} }
}

describe('buildYomiItems', () => {
  it('かな2文字だけを数字付きで取り出す', () => {
    const items = buildYomiItems(makeRules(), { ちゃ: use('428', '283') })
    expect(items.map((i) => i.kana)).toEqual(['ちゃ', 'つぁ', 'かー'])
    expect(items[0]).toMatchObject({
      digits: '28',
      kind: 'youon',
      nums: ['428', '283'],
    })
    expect(items[2]).toMatchObject({ digits: '98', kind: 'long', nums: [] })
  })

  it('rules が無ければ空', () => {
    expect(buildYomiItems(undefined, undefined)).toEqual([])
  })
})

describe('filterScope', () => {
  it('拗音/長音で絞れる', () => {
    const items = buildYomiItems(makeRules(), undefined)
    expect(filterScope(items, 'youon').map((i) => i.kana)).toEqual([
      'ちゃ',
      'つぁ',
    ])
    expect(filterScope(items, 'long').map((i) => i.kana)).toEqual(['かー'])
    expect(filterScope(items, 'all')).toHaveLength(3)
  })
})

describe('shuffle', () => {
  it('元配列を壊さず、要素を落とさない', () => {
    const src = [1, 2, 3, 4, 5]
    const out = shuffle(src, () => 0.5)
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect([...out].sort()).toEqual(src)
  })
})

describe('buildYomiQuestions', () => {
  const items = buildYomiItems(makeRules(), { ちゃ: use('428') })

  it('全部モードは重複なしで全件出す', () => {
    const qs = buildYomiQuestions(items, 0)
    expect(qs).toHaveLength(3)
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(3)
    expect(qs.every((q) => /^\d{2}$/.test(q.answer))).toBe(true)
  })

  it('出題数を指定すると重複なしで切り出す', () => {
    const qs = buildYomiQuestions(items, 2)
    expect(qs).toHaveLength(2)
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(2)
  })

  it('範囲より多い出題数は範囲の全件で打ち止め', () => {
    expect(buildYomiQuestions(items, 99)).toHaveLength(3)
  })

  it('割当数を note に添える', () => {
    const qs = buildYomiQuestions(items, 0)
    const cha = qs.find((q) => q.prompt === 'ちゃ')
    expect(cha?.note).toBe('割当 1 番号 · 428')
  })
})

describe('usageNote', () => {
  it('未使用は 0 と明示する', () => {
    expect(
      usageNote({
        kana: 'かー',
        digits: '98',
        kind: 'long',
        uses: [],
        nums: [],
      })
    ).toContain('割当 0')
  })

  it('7件以上は先頭6件 + 残数', () => {
    const nums = ['001', '002', '003', '004', '005', '006', '007', '008']
    const note = usageNote({
      kana: 'しゃ',
      digits: '48',
      kind: 'youon',
      uses: use(...nums),
      nums,
    })
    expect(note).toBe('割当 8 番号 · 001 002 003 004 005 006 +2')
  })
})

const entry = (num: string, w1: string, w2 = '') =>
  ({ num, w1, w1k: '', w2, w2k: '' } as unknown as NumberEntry)

describe('yomiWordPool', () => {
  const numbers = [
    entry('428', 'チャンピオン'),
    entry('283', 'ちゃぶ台'),
    entry('999', 'ケーキ'),
  ]
  const items = buildYomiItems(makeRules(), { ちゃ: use('428', '283') })

  it('範囲内の読みを使う番号だけを集める', () => {
    expect(yomiWordPool(numbers, items).map((p) => p.num)).toEqual([
      '428',
      '283',
    ])
  })

  it('根拠が対抗語なら対抗語を出す (773 ななみん / にゅさ の取り違え)', () => {
    const items773 = buildYomiItems(makeRules(), {
      ちゃ: [{ num: '773', slot: 'w2' as const }],
    })
    const numbers773 = [entry('773', 'ななみん', '入札')]
    expect(yomiWordPool(numbers773, items773)).toEqual([
      { num: '773', word: '入札' },
    ])
  })

  it('タグと末尾ラベルは落とす', () => {
    const tagged = [entry('428', 'チャンピオン -j#g')]
    expect(yomiWordPool(tagged, items)[0].word).toBe('チャンピオン')
  })

  it('語を持たない番号は落とす (4択の選択肢にできないため)', () => {
    const noWord = [entry('428', ''), entry('283', 'ちゃぶ台')]
    expect(yomiWordPool(noWord, items).map((p) => p.num)).toEqual(['283'])
  })

  it('scope で絞った items を渡せば範囲も狭まる', () => {
    const long = filterScope(items, 'long')
    expect(yomiWordPool(numbers, long)).toEqual([])
  })
})

describe('buildYomiWordQuestions', () => {
  const pool = [
    { num: '428', word: 'チャンピオン' },
    { num: '283', word: 'ちゃぶ台' },
    { num: '288', word: 'ちゃちゃ' },
  ]

  it('番号を出題し、正解語が選択肢に入る', () => {
    const qs = buildYomiWordQuestions(pool, 0, () => 0)
    expect(qs).toHaveLength(3)
    for (const q of qs) {
      expect(q.prompt).toMatch(/^\d{3}$/)
      expect(q.choices).toContain(q.answer)
      expect(new Set(q.choices).size).toBe(q.choices.length)
    }
  })

  it('誤答は同じ範囲の語からしか採らない', () => {
    const words = new Set(pool.map((p) => p.word))
    for (const q of buildYomiWordQuestions(pool, 0, () => 0)) {
      expect(q.choices.every((c) => words.has(c))).toBe(true)
    }
  })

  it('count を指定すればその問数に切る', () => {
    expect(buildYomiWordQuestions(pool, 2, () => 0)).toHaveLength(2)
  })

  it('pool が空なら 0 問 (テストを開始させない)', () => {
    expect(buildYomiWordQuestions([], 0, () => 0)).toEqual([])
  })
})
