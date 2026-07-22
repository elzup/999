import { describe, expect, it } from 'vitest'
import { buildKeypadSummary, claimKeypadGrade } from '../components/KeypadQuiz'

describe('keypad quiz grading', () => {
  it('REQ-FF-005: records a final answer exactly once even before rerender', () => {
    const guard = { current: false }
    const question = { prompt: '1010', answer: 'A' }

    expect(claimKeypadGrade(guard, question, 'A')).toEqual({
      label: '1010',
      correct: true,
      userAnswer: 'A',
      rightAnswer: 'A',
    })
    expect(claimKeypadGrade(guard, question, 'A')).toBeNull()
  })

  it('REQ-FF-006: builds the final summary with all review items', () => {
    const reviews = [
      {
        label: '1010',
        correct: true,
        userAnswer: 'A',
        rightAnswer: 'A',
      },
    ]

    expect(buildKeypadSummary(1, 1, 1_000, 3_400, reviews)).toEqual({
      score: 1,
      total: 1,
      time: 2,
      reviews,
    })
  })
})
