import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isConfirmed,
  repReading,
  validateNumberWords,
} from '../gen-words-lyrics.js'
import { loadRep, loadWordsTsv } from '../rep-store.js'

const lyricsDir = resolve(process.cwd(), 'lyrics')
const ffRows = JSON.parse(
  readFileSync(resolve(process.cwd(), 'app/data/ff.json'), 'utf8')
)

function readingsIn(file) {
  return readFileSync(resolve(lyricsDir, file), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .flatMap((line) => line.split('　'))
}

describe('generated representative word lyrics', () => {
  it('REQ-LYR-001: validates the exact ordered 000-999 source domain', () => {
    const words = Array.from({ length: 1000 }, (_, value) => ({
      num: String(value).padStart(3, '0'),
    }))

    expect(validateNumberWords(words)).toBe(words)
    expect(() => validateNumberWords(words.slice(1))).toThrow(/word source/)
    expect(() =>
      validateNumberWords(words.map((word, i) => (i === 2 ? words[1] : word)))
    ).toThrow(/word source/)
  })

  it('REQ-LYR-002: uses the first resolved reading or a missing placeholder', () => {
    const word = { num: '000', wh1: '丸', wh1k: 'まる' }

    expect(repReading(word, undefined)).toBe('まる')
    expect(repReading({ num: '000' }, undefined)).toBeNull()
    expect(isConfirmed(word, undefined)).toBe(true)
    expect(isConfirmed({ ...word, wm1k: 'ボール' }, undefined)).toBe(false)
  })

  it('REQ-LYR-001/003: has ten 100-entry sheets with four readings per line', () => {
    for (let sheet = 0; sheet < 10; sheet++) {
      const name = `words_sheet${String(sheet).padStart(2, '0')}.txt`
      const lines = readFileSync(resolve(lyricsDir, name), 'utf8')
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
      const from = String(sheet * 100).padStart(3, '0')
      const to = String(sheet * 100 + 99).padStart(3, '0')
      const header = readFileSync(resolve(lyricsDir, name), 'utf8').split(
        '\n'
      )[0]

      expect(readingsIn(name)).toHaveLength(100)
      expect(lines.every((line) => line.split('　').length <= 4)).toBe(true)
      expect(header).toBe(`# ${from}-${to} (100語)`)
    }
  })

  it('REQ-LYR-001: all-file is the ordered concatenation of ten sheets', () => {
    const sheets = Array.from({ length: 10 }, (_, sheet) =>
      readingsIn(`words_sheet${String(sheet).padStart(2, '0')}.txt`)
    ).flat()

    expect(readingsIn('words_all.txt')).toEqual(sheets)
  })

  it('REQ-LYR-002: generated readings exactly match the canonical store', () => {
    const rep = loadRep().rep || {}
    const words = validateNumberWords(
      loadWordsTsv().sort((a, b) => a.num.localeCompare(b.num))
    )
    const expected = words.map(
      (word) => repReading(word, rep[word.num]) || '＿'
    )

    expect(readingsIn('words_all.txt')).toEqual(expected)
  })
})

describe('generated FF lyrics', () => {
  it('REQ-LYR-004: partitions all 256 FF readings into two groups', () => {
    const nnCc = readingsIn('ff_nn-cc.txt')
    const ncCn = readingsIn('ff_nc-cn.txt')

    expect(nnCc).toHaveLength(136)
    expect(ncCn).toHaveLength(120)
    expect(nnCc.length + ncCn.length).toBe(256)
  })

  it('REQ-LYR-005: exactly matches the shared FF readings by type', () => {
    const nnCc = readingsIn('ff_nn-cc.txt')
    const ncCn = readingsIn('ff_nc-cn.txt')

    expect(nnCc).toEqual(
      ffRows
        .filter((row) => ['NN', 'CC'].includes(row.type))
        .map((row) => row.read)
    )
    expect(ncCn).toEqual(
      ffRows
        .filter((row) => ['NC', 'CN'].includes(row.type))
        .map((row) => row.read)
    )
  })
})
