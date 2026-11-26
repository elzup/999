import { describe, expect, it } from 'vitest'
import { byId, fromNumberDoc } from '../symbols/model.js'
import { toDbSymbol } from '../symbols/db-shape.js'
import { SYMBOLS, WORDS, wordDoc, wordDocId } from '../symbols/mirror.js'
import { createSymbolReader, symbolIdOf } from '../symbols/symbol-source.js'

// Firestore のうち symbol-source が使う口だけを持つ偽物
function fakeStore(collections) {
  const snapOf = (col, id) => {
    const data = collections[col]?.[id]
    return { id, exists: data !== undefined, data: () => data }
  }
  const reads = []
  const collection = (col) => ({
    doc: (id) => ({ col, id }),
    where: (field, op, value) => ({
      get: async () => ({
        docs: Object.keys(collections[col] ?? {})
          .map((id) => snapOf(col, id))
          .filter(
            (snap) =>
              field.split('.').reduce((v, k) => v?.[k], snap.data()) > value
          ),
      }),
    }),
    get: async () => ({
      docs: Object.keys(collections[col] ?? {}).map((id) => snapOf(col, id)),
    }),
  })
  return {
    reads,
    collection,
    getAll: async (...refs) => {
      reads.push(...refs.map((ref) => `${ref.col}/${ref.id}`))
      return refs.map((ref) => snapOf(ref.col, ref.id))
    },
  }
}

const numberDoc = (num, extra = {}) => ({
  num,
  hito: 'まい#日常,麻衣(先輩)',
  mono: 'ニッパー,茶葉,,庭#g',
  gainen: '',
  slots: {
    wh1: { word: 'まい#日常', kana: 'まい', imageUrl: '' },
    wm1: { word: 'ニッパー', kana: 'にっぱ+ー', imageUrl: '' },
    wm2: { word: '茶葉', kana: 'ちゃば', imageUrl: '' },
  },
  rep: { picks: [{ k: 'まい', w: 'まい#日常' }], confirmed: true },
  ratings: [{ k: 'ちゃば', w: '茶葉', v: 2 }],
  updatedAt: '2026-11-26T00:00:00.000Z',
  source: 'app',
  ...extra,
})

/** numbers の文書を、移行と同じ変換で symbols / words の中身にする */
function collectionsOf(docs) {
  return docs.reduce(
    (acc, doc) => {
      const { symbol, words } = fromNumberDoc(doc)
      const { doc: data } = toDbSymbol(symbol, byId(words), wordDocId)
      return {
        [SYMBOLS]: {
          ...acc[SYMBOLS],
          [symbol.id]: JSON.parse(JSON.stringify(data)),
        },
        [WORDS]: {
          ...acc[WORDS],
          ...Object.fromEntries(
            words.map((w) => [wordDocId(w.id), wordDoc(w)])
          ),
        },
      }
    },
    { [SYMBOLS]: {}, [WORDS]: {} }
  )
}

describe('symbol-source: symbols / words から numbers の形を組み立てる', () => {
  it('組み立てた文書は元の numbers の文書と同じ (途中の空き枠も保つ)', async () => {
    const doc = numberDoc('288')
    const reader = createSymbolReader(fakeStore(collectionsOf([doc])))
    const back = (await reader.readNumbers(['288']))['288']
    expect(back).toEqual(doc)
    expect(back.mono).toBe('ニッパー,茶葉,,庭#g')
  })

  it('updatedAt (extras に入る) で変わった番号だけを読む', async () => {
    const old = numberDoc('001', { updatedAt: '2026-11-01T00:00:00.000Z' })
    const fresh = numberDoc('002', { updatedAt: '2026-11-26T00:00:00.000Z' })
    const reader = createSymbolReader(fakeStore(collectionsOf([old, fresh])))
    expect(
      Object.keys(await reader.readChangedSince('2026-11-10T00:00:00.000Z'))
    ).toEqual(['002'])
    expect(Object.keys(await reader.readChangedSince(null)).sort()).toEqual([
      '001',
      '002',
    ])
  })

  it('無い番号は含めない', async () => {
    const reader = createSymbolReader(
      fakeStore(collectionsOf([numberDoc('001')]))
    )
    expect(await reader.readNumbers(['001', '999'])).toEqual({
      '001': numberDoc('001'),
    })
  })

  it('語は一度読んだら読み直さない (語の中身は ID から決まり変わらない)', async () => {
    const store = fakeStore(collectionsOf([numberDoc('001')]))
    const reader = createSymbolReader(store)
    await reader.readNumbers(['001'])
    const first = store.reads.filter((r) => r.startsWith(`${WORDS}/`)).length
    await reader.readNumbers(['001'])
    expect(first).toBeGreaterThan(0)
    expect(store.reads.filter((r) => r.startsWith(`${WORDS}/`))).toHaveLength(
      first
    )
  })

  it('指す語が words に無ければ、語を落とした文書を返さずに止める', async () => {
    const collections = collectionsOf([numberDoc('001')])
    const [lost] = Object.keys(collections[WORDS])
    const broken = {
      ...collections,
      [WORDS]: { ...collections[WORDS], [lost]: undefined },
    }
    const reader = createSymbolReader(fakeStore(broken))
    await expect(reader.readNumbers(['001'])).rejects.toThrow(lost)
  })

  it('番号の symbol の ID は n:<番号>', () => {
    expect(symbolIdOf('051')).toBe('n:051')
  })
})
