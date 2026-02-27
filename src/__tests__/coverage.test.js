import { describe, it, expect } from 'vitest'
import { generateCoverage } from '../coverage.js'

describe('generateCoverage', () => {
  const coverage = generateCoverage()

  it('五十音のカバレッジ', () => {
    expect(coverage.gojuon.filter((e) => e.covered).length).toBeGreaterThan(40)
  })

  it('濁音は全て清音経由でカバー', () => {
    const uncovered = coverage.dakuon.filter((e) => !e.covered)
    expect(uncovered).toEqual([])
  })

  it('拗音のカバレッジ', () => {
    const covered = coverage.youon.filter((e) => e.covered)
    expect(covered.length).toBeGreaterThan(0)
  })

  it('ジャジュジョ例外は全てカバー', () => {
    expect(coverage.exceptions.every((e) => e.covered)).toBe(true)
  })

  it('サマリーを出力', () => {
    const { summary } = coverage
    expect(summary.rate).toBeGreaterThan(90)
  })
})
