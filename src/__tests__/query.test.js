import { describe, it, expect } from 'vitest'
import { buildSearchWord, buildQuery } from '../images/query.js'

describe('buildSearchWord', () => {
  it('#タグ をスペース展開して残す', () => {
    expect(buildSearchWord('マオ#コードギアス')).toBe('マオ コードギアス')
  })

  it('複数 # も展開', () => {
    expect(buildSearchWord('ヒナ#プリコネ#bl')).toBe('ヒナ プリコネ bl')
  })

  it('(注釈) を除去', () => {
    expect(buildSearchWord('麻衣(先輩)')).toBe('麻衣')
  })

  it('comma は先頭のみ採用', () => {
    expect(buildSearchWord('麻衣(先輩),まい,レイ#pr')).toBe('麻衣')
  })

  it(' -suffix を除去', () => {
    expect(buildSearchWord('カイト -p')).toBe('カイト')
  })

  it('空文字は空', () => {
    expect(buildSearchWord('')).toBe('')
  })

  it('タグも注釈も無い語はそのまま', () => {
    expect(buildSearchWord('舞い')).toBe('舞い')
  })
})

describe('buildQuery', () => {
  it('title は付与しない (語のみ)', () => {
    expect(buildQuery('マオ#コードギアス')).toBe('マオ コードギアス')
  })
})
