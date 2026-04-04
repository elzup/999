import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_NAMES_JA,
  calculateWeekday,
  createWeekdayQuiz,
  isLeapYear,
} from '../lib/weekday'

describe('weekday helpers', () => {
  it('calculates known weekdays', () => {
    expect(calculateWeekday('2024/02/29')?.weekdayJa).toBe('木')
    expect(calculateWeekday('2000/01/01')?.weekdayJa).toBe('土')
    expect(calculateWeekday('2026/04/04')?.weekdayJa).toBe('土')
    expect(calculateWeekday('1500/01/01')?.weekdayJa).toBe('月')
  })

  it('uses sunday-first weekday ordering', () => {
    expect(WEEKDAY_NAMES_JA).toEqual(['日', '月', '火', '水', '木', '金', '土'])
  })

  it('applies leap year adjustment for january and february', () => {
    const feb = calculateWeekday('2024/02/29')
    const mar = calculateWeekday('2024/03/01')
    expect(feb?.isLeapYear).toBe(true)
    expect(feb?.leapAdjust).toBe(-1)
    expect(mar?.leapAdjust).toBe(0)
  })

  it('rejects invalid and out-of-range dates', () => {
    expect(calculateWeekday('2023/02/29')).toBeNull()
    expect(calculateWeekday('1499/12/31')).toBeNull()
    expect(calculateWeekday('2501/01/01')).toBeNull()
    expect(calculateWeekday('not-a-date')).toBeNull()
  })

  it('detects leap years correctly', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2025)).toBe(false)
  })

  it('creates a 10-question quiz within 1500-2500 and without duplicates', () => {
    let seed = 17
    const random = () => {
      seed = (seed * 48271) % 0x7fffffff
      return seed / 0x7fffffff
    }
    const quiz = createWeekdayQuiz(10, random)
    expect(quiz).toHaveLength(10)
    const dates = quiz.map((question) => question.date)
    expect(new Set(dates).size).toBe(10)
    for (const question of quiz) {
      const [year] = question.date.split('/').map(Number)
      expect(year).toBeGreaterThanOrEqual(1500)
      expect(year).toBeLessThanOrEqual(2500)
      expect(question.result.weekdayJa.length).toBe(1)
    }
  })
})
