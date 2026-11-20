import { describe, expect, it } from 'vitest'
import { candidateItems, type ImageState } from '../lib/imagePicker'

const img = (hash: string) => ({ url: `https://img/${hash}.webp`, hash })

const state: ImageState = {
  kinds: { num: { label: '番号', slots: ['w1', 'w2'] } },
  targets: [
    { id: '001', kind: 'num', w1: 'アリス', w2: 'イヌ' },
    { id: '002', kind: 'num', w1: 'ボブ', w2: 'ネコ#i' },
    { id: '003', kind: 'num', w1: 'サバンナ', w2: '' },
  ],
  images: {
    '001': { w1: img('a'), w2: img('b') },
    '002': { w1: img('c'), w2: img('d') },
    '003': { w1: img('e') },
  },
  keep: { '001:w1': true },
  redo: {},
  // 003:w1 は «サバナ» のときに取った画像
  candidates: { '003:w1': { word: 'サバナ' }, '001:w2': { word: 'イヌ' } },
  choices: { '002:w1': 3, '001:w1': 2 },
}

const keys = (filter: Parameters<typeof candidateItems>[1]) =>
  candidateItems(state, filter).map((it) => `${it.id}:${it.slot}`)

describe('candidateItems の絞り込み', () => {
  it('未確定: 画像があり確定していない枠 (アバター #i は除く)', () => {
    expect(keys('unkept')).toEqual(['001:w2', '002:w1', '003:w1'])
  })

  it('語変更: 画像を取ったときの語と今の語が違う枠', () => {
    expect(keys('changed')).toEqual(['003:w1'])
  })

  it('候補あり: 選んでいない候補が残っていて確定していない枠', () => {
    expect(keys('choices')).toEqual(['002:w1'])
  })

  it('確定済み: 確定した枠', () => {
    expect(keys('kept')).toEqual(['001:w1'])
  })

  it('候補の数と語変更を枠ごとに持つ', () => {
    const item = candidateItems(state, 'all').find(
      (it) => it.id === '003' && it.slot === 'w1'
    )
    expect(item).toMatchObject({ changed: true, choices: 0 })
  })
})

describe('検索語の誤り (タグを展開しないまま取った画像)', () => {
  const base: ImageState = {
    kinds: { num: { label: '番号', slots: ['w1', 'w2'] } },
    targets: [
      { id: '010', kind: 'num', w1: 'ミミ#pr -a', w2: 'マオ#cg' },
      { id: '011', kind: 'num', w1: 'ボブ', w2: 'エリカ#tri' },
    ],
    images: {
      '010': { w1: img('m'), w2: img('o') },
      '011': { w1: img('b'), w2: img('e') },
    },
    keep: { '010:w2': true },
    redo: {},
    candidates: {
      '010:w1': { query: 'ミミ pr' }, // 展開しないまま取った
      '010:w2': { query: 'マオ cg' }, // 確定済みでも出す
      '011:w1': { query: 'ボブ' }, // タグの無い語は当たらない
      '011:w2': { query: 'エリカ 別の語' }, // 自分で打った語は当たらない
    },
  }
  const titles = { pr: 'プリコネ', cg: 'コードギアス', tri: 'トリッカル' }

  it('取ったときの検索ワードが展開しない語と同じ枠だけ', () => {
    const keys = candidateItems(base, 'stale', titles).map(
      (it) => `${it.id}:${it.slot}`
    )
    expect(keys).toEqual(['010:w1', '010:w2'])
  })

  it('正式名の分からないタグは判定しない (展開しても同じ語になる)', () => {
    expect(candidateItems(base, 'stale', {})).toEqual([])
  })
})

describe('keepOpened (確定しても開いた枠は一覧に残す)', () => {
  it('フィルタから外れた開いた枠を、元の並びのまま足す', async () => {
    const { keepOpened } = await import('../lib/imagePicker')
    const all = candidateItems(state, 'all')
    const key = (it: (typeof all)[number]) => `${it.id}:${it.slot}`
    const matched = all.slice(1, 2)
    const opened = new Set([key(all[0])])
    expect(keepOpened(all, matched, opened).map(key)).toEqual(
      [all[0], all[1]].map(key)
    )
    expect(keepOpened(all, matched, new Set())).toBe(matched)
  })
})
