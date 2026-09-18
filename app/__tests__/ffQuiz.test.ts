import { describe, expect, it } from 'vitest'
import {
  FF_DIRS,
  FF_ROWS,
  buildFfQuestions,
  buildNibble,
  isValidFfRow,
} from '../lib/ffQuiz'

describe('FF data', () => {
  it('REQ-FF-001: contains every 00-FF value exactly once', () => {
    expect(FF_ROWS).toHaveLength(256)
    expect(new Set(FF_ROWS.map((row) => row.hex)).size).toBe(256)

    FF_ROWS.forEach((row, value) => {
      expect(row.hex).toBe(value.toString(16).toUpperCase().padStart(2, '0'))
      expect(row.bin).toBe(value.toString(2).padStart(8, '0'))
      expect(['NN', 'NC', 'CN', 'CC']).toContain(row.type)
    })
  })
})

describe('FF choice questions', () => {
  it.each(FF_DIRS)(
    'REQ-FF-002/003: %s has unique choices and one answer',
    (dir) => {
      const questions = buildFfQuestions(dir, 32)

      expect(questions).toHaveLength(32)
      for (const question of questions) {
        expect(new Set(question.choices).size).toBe(question.choices.length)
        expect(
          question.choices.filter((choice) => choice === question.answer)
        ).toHaveLength(1)
      }
    }
  )

  it('REQ-FF boundary: treats negative counts as an empty request', () => {
    expect(buildFfQuestions('hex2read', -1)).toEqual([])
    expect(buildNibble('b2h', -1)).toEqual([])
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'REQ-FF boundary: treats non-finite count %s as an empty request',
    (count) => {
      expect(buildFfQuestions('hex2read', count)).toEqual([])
      expect(buildNibble('b2h', count)).toEqual([])
    }
  )

  it('REQ-FF-002: uses word or kana rather than the composite read', () => {
    const questions = buildFfQuestions('hex2read', 256)

    for (const question of questions) {
      const row = FF_ROWS.find(({ hex }) => hex === question.prompt)
      expect(row).toBeDefined()
      expect(question.answer).toBe(row?.word || row?.kana)
    }
  })

  it('REQ-FF-003: asks each reverse word once and accepts every hex it maps to', () => {
    const hexesByLabel = new Map<string, string[]>()
    for (const row of FF_ROWS.filter(isValidFfRow)) {
      const label = row.word || row.kana
      hexesByLabel.set(label, [...(hexesByLabel.get(label) ?? []), row.hex])
    }
    // 同じ語が複数 hex を指す行が実データに存在する (ピッピ = 1B / B1 など)
    const ambiguous = [...hexesByLabel].filter(([, hexes]) => hexes.length > 1)
    expect(ambiguous.length).toBeGreaterThan(0)

    const questions = buildFfQuestions('read2hex', 256)

    // 出題は語ごとに 1 問。曖昧な語も除外せず出す
    expect(questions).toHaveLength(hexesByLabel.size)
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(questions.length)

    for (const question of questions) {
      const hexes = hexesByLabel.get(question.prompt)
      expect(hexes, question.prompt).toBeDefined()
      const accepted = question.answers ?? [question.answer]
      expect([...accepted].sort()).toEqual([...(hexes ?? [])].sort())
      // 受け付ける hex はすべて選択肢に並ぶ
      for (const hex of accepted) expect(question.choices).toContain(hex)
    }
  })

  it('REQ-FF-003: leaves unambiguous questions with a single answer', () => {
    const questions = buildFfQuestions('hex2read', 32)
    for (const question of questions) {
      expect(question.answers).toBeUndefined()
    }
  })

  it.each(['—', '＿', '#REF!', '#N/A', '#ERROR!', '#VALUE!'])(
    'REQ-FF-007: excludes the missing marker %s from every quiz face',
    (marker) => {
      const base = {
        hex: '0A',
        type: 'NN',
        bin: '00001010',
        exp: '10',
        word: '鶏',
        kana: 'にわとり',
        read: 'にわとり',
      }

      expect(isValidFfRow({ ...base, word: marker })).toBe(false)
      expect(isValidFfRow({ ...base, hex: marker })).toBe(false)
      expect(isValidFfRow({ ...base, bin: marker })).toBe(false)
    }
  )
})

describe('nibble questions', () => {
  it.each(['b2h', 'h2b'] as const)(
    'REQ-FF-004: %s keeps every prompt and answer in the 0-15 domain',
    (kind) => {
      const questions = buildNibble(kind, 64)

      expect(questions).toHaveLength(64)
      for (const question of questions) {
        if (kind === 'b2h') {
          expect(question.prompt).toMatch(/^[01]{4}$/)
          expect(question.answer).toMatch(/^[0-9A-F]$/)
          expect(Number.parseInt(question.prompt, 2)).toBe(
            Number.parseInt(question.answer, 16)
          )
        } else {
          expect(question.prompt).toMatch(/^[0-9A-F]$/)
          expect(question.answer).toMatch(/^[01]{4}$/)
          expect(Number.parseInt(question.prompt, 16)).toBe(
            Number.parseInt(question.answer, 2)
          )
        }
      }
    }
  )
})
