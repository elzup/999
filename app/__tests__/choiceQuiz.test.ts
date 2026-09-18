import { describe, expect, it } from 'vitest'
import {
  acceptedOf,
  isCorrectChoice,
  type ChoiceQuestion,
} from '../components/ChoiceQuiz'

const q = (over: Partial<ChoiceQuestion> = {}): ChoiceQuestion => ({
  prompt: 'ピッピ',
  answer: '1B',
  choices: ['1B', 'B1', '2C', 'D4'],
  ...over,
})

describe('ChoiceQuiz scoring', () => {
  it('falls back to the single answer when no set is given', () => {
    expect(acceptedOf(q())).toEqual(['1B'])
    expect(isCorrectChoice(q(), '1B')).toBe(true)
    expect(isCorrectChoice(q(), 'B1')).toBe(false)
  })

  it('accepts any value in the set when the answer is ambiguous', () => {
    const question = q({ answers: ['1B', 'B1'] })
    expect(isCorrectChoice(question, '1B')).toBe(true)
    expect(isCorrectChoice(question, 'B1')).toBe(true)
    expect(isCorrectChoice(question, '2C')).toBe(false)
  })

  it('never accepts a value outside the set', () => {
    expect(isCorrectChoice(q({ answers: [] }), '1B')).toBe(false)
  })
})
