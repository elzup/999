import { describe, it, expect } from 'vitest'
import { buildSearchWord, buildQuery } from '../images/query.js'

describe('buildSearchWord', () => {
  it('#タグ をスペース展開して残す', () => {
    expect(buildSearchWord('マオ#コードギアス')).toBe('マオ コードギアス')
  })

  it('複数 # も展開', () => {
    expect(buildSearchWord('ヒナ#プリコネ#bl')).toBe('ヒナ プリコネ bl')
  })

  it('括弧の中も検索文脈として残す', () => {
    expect(buildSearchWord('麻衣(先輩)')).toBe('麻衣 先輩')
    expect(buildSearchWord('四季(真賀田)')).toBe('四季 真賀田')
  })

  it('comma は先頭のみ採用 (括弧の中は残す)', () => {
    expect(buildSearchWord('麻衣(先輩),まい,レイ#pr')).toBe('麻衣 先輩')
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

describe('buildSearchWord with tagMap', () => {
  const map = { pr: 'プリコネ', bl: 'ブルアカ', ｽﾀﾚ: 'スタレ' }
  it('略語タグを正式名に展開', () => {
    expect(buildSearchWord('ミミ#pr', map)).toBe('ミミ プリコネ')
    expect(buildSearchWord('ヒナ#bl', map)).toBe('ヒナ ブルアカ')
  })
  it('末尾 -suffix 付きタグも展開', () => {
    expect(buildSearchWord('ブローニャ#ｽﾀﾚ -a', map)).toBe('ブローニャ スタレ')
  })
  it('map に無いタグはそのまま', () => {
    expect(buildSearchWord('マオ#コードギアス', map)).toBe('マオ コードギアス')
  })
})

describe('buildQuery', () => {
  it('title は付与しない (語のみ)', () => {
    expect(buildQuery('マオ#コードギアス')).toBe('マオ コードギアス')
  })
})
