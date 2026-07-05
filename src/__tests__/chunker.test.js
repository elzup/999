import { describe, it, expect } from 'vitest'
import { chunkDigits, chunkStory } from '../chunker.js'

describe('chunkDigits', () => {
  it('9桁を3桁ずつに分割', () => {
    expect(chunkDigits('901154629')).toEqual(['901', '154', '629'])
  })

  it('端数は末尾チャンクとして残す', () => {
    expect(chunkDigits('9011')).toEqual(['901', '1'])
    expect(chunkDigits('90115')).toEqual(['901', '15'])
  })

  it('ちょうど3桁は1チャンク', () => {
    expect(chunkDigits('901')).toEqual(['901'])
  })

  it('数字以外はエラー', () => {
    expect(() => chunkDigits('90a')).toThrow()
    expect(() => chunkDigits('')).toThrow()
  })
})

describe('chunkStory', () => {
  it('各チャンクを最良スコアの単語へ変換', () => {
    const { chunks } = chunkStory('901')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].digits).toBe('901')
    expect(chunks[0].word).toBeTruthy()
    expect(chunks[0].score).toBeGreaterThan(0)
    expect(chunks[0].candidates.length).toBeGreaterThan(0)
  })

  it('複数チャンクを空白区切りの物語にまとめる', () => {
    const { chunks, story } = chunkStory('901154629')
    expect(chunks).toHaveLength(3)
    expect(story.split(' ')).toHaveLength(3)
    expect(story).toBe(chunks.map((c) => c.word).join(' '))
  })

  it('候補はスコア降順', () => {
    const { chunks } = chunkStory('901')
    const scores = chunks[0].candidates.map((c) => c.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })

  it('数字以外はエラー', () => {
    expect(() => chunkStory('12x')).toThrow()
  })
})
