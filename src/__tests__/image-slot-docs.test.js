import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  countFiles,
  fromSlotDocs,
  replaceImage,
  splitSlotKey,
  toSlotDocs,
} from '../images/slot-docs.js'

const img = (hash) => ({
  url: `https://example.test/${hash}.webp`,
  hash,
  sourcePage: '',
  sourceImageUrl: `https://src.test/${hash}.jpg`,
  uploadedAt: '2026-11-18T00:00:00.000Z',
})

const files = () => ({
  manifest: { version: 1, images: { '001': { w1: img('a'), w2: img('b') } } },
  keep: { version: 1, keep: { '001:w1': true } },
  redo: {
    version: 1,
    redo: { '001:w2': { flaggedAt: '2026-11-18T00:00:00.000Z', reason: '' } },
  },
  candidates: {
    version: 1,
    items: {
      '001:w1': { word: '石', query: '石', status: 'ok' },
      // 画像が無く候補だけある枠 (取得失敗) も落とさない
      '043:w1#ｽﾀﾚ': { word: '黄泉#ｽﾀﾚ', query: '黄泉', status: 'error' },
    },
  },
})

describe('toSlotDocs / fromSlotDocs', () => {
  it('往復すると元の 4 ファイルに戻る', () => {
    expect(fromSlotDocs(toSlotDocs(files()))).toEqual(files())
  })

  it('4 ファイルのどれかにある枠をすべて 1 文書にする', () => {
    const docs = toSlotDocs(files())
    expect(Object.keys(docs)).toEqual(['001:w1', '001:w2', '043:w1#ｽﾀﾚ'])
    expect(docs['043:w1#ｽﾀﾚ']).toMatchObject({
      id: '043',
      slot: 'w1#ｽﾀﾚ',
      image: null,
      keep: false,
      redo: null,
    })
  })

  it('入力を書き換えない', () => {
    const input = files()
    toSlotDocs(input)
    expect(input).toEqual(files())
  })

  it('件数を数える', () => {
    expect(countFiles(files())).toEqual({
      images: 2,
      keep: 1,
      redo: 1,
      candidates: 2,
    })
  })
})

describe('splitSlotKey', () => {
  it('最初の : で id と slot に分ける', () => {
    expect(splitSlotKey('043:w1#ｽﾀﾚ')).toEqual({ id: '043', slot: 'w1#ｽﾀﾚ' })
  })
  it('id が無いキーは弾く', () => {
    expect(() => splitSlotKey(':w1')).toThrow()
    expect(() => splitSlotKey('001')).toThrow()
  })
})

describe('replaceImage', () => {
  const doc = toSlotDocs(files())['001:w1']

  it('前の画像を history の先頭に残す', () => {
    const next = replaceImage(doc, img('c'))
    expect(next.image.hash).toBe('c')
    expect(next.history.map((h) => h.hash)).toEqual(['a'])
    expect(doc.image.hash).toBe('a')
  })

  it('同じ画像なら history を増やさない', () => {
    expect(replaceImage(doc, img('a')).history).toEqual([])
  })

  it(`history は ${HISTORY_LIMIT} 件まで`, () => {
    const many = Array.from({ length: HISTORY_LIMIT + 3 }, (_, i) =>
      img(`h${i}`)
    )
    const last = many.reduce(replaceImage, doc)
    expect(last.history).toHaveLength(HISTORY_LIMIT)
  })
})
