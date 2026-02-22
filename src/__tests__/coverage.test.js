import { describe, it, expect } from 'vitest'
import { generateCoverage } from '../coverage.js'

describe('generateCoverage', () => {
  const coverage = generateCoverage()

  it('五十音のカバレッジ', () => {
    const uncovered = coverage.gojuon.filter((e) => !e.covered)
    console.log(
      '五十音 未対応:',
      uncovered.map((e) => e.kana).join(', ') || 'なし',
    )
    expect(coverage.gojuon.filter((e) => e.covered).length).toBeGreaterThan(40)
  })

  it('濁音は全て清音経由でカバー', () => {
    const uncovered = coverage.dakuon.filter((e) => !e.covered)
    console.log(
      '濁音 未対応:',
      uncovered.map((e) => `${e.kana}(→${e.note})`).join(', ') || 'なし',
    )
  })

  it('拗音のカバレッジ', () => {
    const covered = coverage.youon.filter((e) => e.covered)
    const uncovered = coverage.youon.filter((e) => !e.covered)
    console.log('拗音 対応:', covered.map((e) => e.note).join(', '))
    console.log(
      '拗音 未対応:',
      uncovered.map((e) => e.kana).join(', ') || 'なし',
    )
  })

  it('ジャジュジョ例外は全てカバー', () => {
    expect(coverage.exceptions.every((e) => e.covered)).toBe(true)
    console.log('例外:', coverage.exceptions.map((e) => e.note).join(', '))
  })

  it('サマリーを出力', () => {
    const { summary } = coverage
    console.log(
      `\nカバレッジ: ${summary.covered}/${summary.total} (${summary.rate}%)`,
    )
    expect(summary.rate).toBeGreaterThan(90)
  })
})
