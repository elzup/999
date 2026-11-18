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
