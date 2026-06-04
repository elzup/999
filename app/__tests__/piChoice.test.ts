import { describe, expect, test } from 'vitest'
import { genChoiceOptions } from '../lib/piChoice'

describe('genChoiceOptions full', () => {
  test('returns 4 distinct options including the correct value', () => {
    for (let i = 0; i < 200; i++) {
      const correct = String(i % 1000).padStart(3, '0')
      const opts = genChoiceOptions(correct, 'full')
      expect(opts).toHaveLength(4)
      const values = opts.map((o) => o.value)
      expect(new Set(values).size).toBe(4)
      expect(values).toContain(correct)
      // full は display === value (マスクなし)
      opts.forEach((o) => expect(o.display).toBe(o.value))
    }
  })
})

describe('genChoiceOptions masked', () => {
  test('masks exactly one digit at the same position for all options', () => {
    for (let i = 0; i < 300; i++) {
      const correct = String((i * 7) % 1000).padStart(3, '0')
      const opts = genChoiceOptions(correct, 'masked')
      expect(opts).toHaveLength(4)

      // 各 display は X をちょうど1つ含み、位置が全選択肢で同一
      const maskPositions = opts.map((o) => o.display.indexOf('X'))
      maskPositions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0))
      expect(new Set(maskPositions).size).toBe(1)
      opts.forEach((o) => {
        expect(o.display.split('').filter((c) => c === 'X')).toHaveLength(1)
      })
    }
  })

  test('correct value is uniquely identifiable from visible digits', () => {
    for (let i = 0; i < 300; i++) {
      const correct = String((i * 13 + 1) % 1000).padStart(3, '0')
      const opts = genChoiceOptions(correct, 'masked')
      const maskPos = opts[0].display.indexOf('X')
      const visibleOf = (s: string) =>
        s.slice(0, maskPos) + s.slice(maskPos + 1)

      // 見える2桁が全選択肢でユニーク → 正解を一意に特定できる
      const visibles = opts.map((o) => visibleOf(o.value))
      expect(new Set(visibles).size).toBe(4)

      // 正解は選択肢に含まれ、その見える2桁を持つのは1つだけ
      const correctVisible = visibleOf(correct)
      const matches = opts.filter((o) => visibleOf(o.value) === correctVisible)
      expect(matches).toHaveLength(1)
      expect(matches[0].value).toBe(correct)
    }
  })
})
