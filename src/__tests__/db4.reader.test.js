// 新しい形から番号の文書を組み立てて読む口 (DB 計画 P6)
import { describe, expect, it } from 'vitest'
import { fromLegacy } from '../db4/from-legacy.js'
import { createDb4Reader } from '../db4/reader.js'
import { SYMBOLS, WORDS } from '../db4/write-layer.js'
import { sheetFormOfDoc } from '../firestore/sheet-bisync.js'

/** Firestore のうち reader が使う口だけを持つ偽物 (where は == と > だけ) */
function fakeStore(collections) {
  const snapOf = (col, id) => {
    const data = collections[col]?.[id]
    return { id, exists: data !== undefined, data: () => data }
  }
  const all = (col) =>
    Object.keys(collections[col] ?? {}).map((id) => snapOf(col, id))
  return {
    collection: (col) => ({
      get: async () => ({ docs: all(col) }),
      doc: (id) => ({ col, id }),
      where: (field, op, value) => ({
        get: async () => ({
          docs: all(col).filter((snap) =>
            op === '=='
              ? snap.data()[field] === value
              : snap.data()[field] > value
          ),
        }),
      }),
    }),
    getAll: async (...refs) => refs.map((ref) => snapOf(ref.col, ref.id)),
  }
}

const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })
const numbers = [
  {
    num: '106',
    hito: 'トロ',
    mono: 'トロ,泥',
    slots: {
      wh1: slot('トロ', 'とろ'),
      wm1: slot('トロ', 'とろ'),
      wm2: slot('泥'),
    },
    updatedAt: '2026-11-27T01:00:00.000Z',
  },
  {
    num: '233',
    hito: '',
    mono: 'ニス',
    slots: { wm1: slot('ニス', 'にす') },
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
]
const storeOf = ({ symbols, words }) =>
  fakeStore({
    [SYMBOLS]: Object.fromEntries(symbols.map(({ id, ...s }) => [id, s])),
    [WORDS]: Object.fromEntries(words.map(({ id, ...w }) => [id, w])),
  })

describe('createDb4Reader', () => {
  it('番号の文書をシートと同じ形で組み立て、derived も付ける', async () => {
    const reader = createDb4Reader(storeOf(fromLegacy({ numbers })))
    const docs = await reader.readNumbers(['106', '233', '999'])
    expect(Object.keys(docs).sort()).toEqual(['106', '233'])
    for (const doc of numbers) {
      expect(sheetFormOfDoc(docs[doc.num])).toEqual(sheetFormOfDoc(doc))
      expect(docs[doc.num].slots).toEqual(doc.slots)
      expect(docs[doc.num].derived).toBeDefined()
    }
  })

  it('updatedAt がそれより新しい番号だけを読む。null なら番号の記号を全部 (カードは含めない)', async () => {
    const built = fromLegacy({
      numbers,
      cards: [
        { suit: 'S', rank: 'A', person: 'エース', object: '', action: '' },
      ],
    })
    const reader = createDb4Reader(storeOf(built))
    expect(
      Object.keys(await reader.readChangedSince('2026-11-25T00:00:00.000Z'))
    ).toEqual(['106'])
    expect(Object.keys(await reader.readChangedSince(null)).sort()).toEqual([
      '106',
      '233',
    ])
  })

  it('指す語が無ければ黙って落とさずに投げる', async () => {
    const built = fromLegacy({ numbers })
    const reader = createDb4Reader(
      storeOf({ ...built, words: built.words.slice(1) })
    )
    await expect(reader.readNumbers(['106', '233'])).rejects.toThrow(
      'words にない語'
    )
  })
})
