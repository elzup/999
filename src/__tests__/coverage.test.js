import { describe, it, expect } from 'vitest'
import { generateCoverage } from '../coverage.js'

describe('generateCoverage', () => {
  const coverage = generateCoverage()

  it('未対応かな一覧', () => {
    const allEntries = [
      ...coverage.gojuon,
      ...coverage.dakuon,
      ...coverage.handakuon,
      ...coverage.youon,
      ...coverage.exceptions,
    ]
    const uncovered = allEntries
      .filter((e) => !e.covered)
      .map((e) => e.kana)
    expect(uncovered).toMatchSnapshot()
  })

  it('サマリー', () => {
    expect(coverage.summary).toMatchSnapshot()
  })
})
