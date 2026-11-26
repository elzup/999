// 画像を確定したら、同じ transaction で語の画像も書く (DB 計画 P8)
import { describe, expect, it } from 'vitest'
import { fromLegacy } from '../db4/from-legacy.js'
import { commitWordImage, prepareWordImage } from '../db4/word-image-write.js'
import { createSlotStore } from '../images/slot-store.js'

const slot = (word) => ({ word, kana: '', imageUrl: '' })

function fakeFirestore(built) {
  const data = new Map([
    ...built.symbols.map(({ id, ...s }) => [`symbols/${id}`, s]),
    ...built.words.map(({ id, ...w }) => [`words/${id}`, w]),
  ])
  const ref = (col, id) => ({ path: `${col}/${id}`, id })
  const snapOf = (r) => ({
    id: r.id,
    exists: data.has(r.path),
    data: () => data.get(r.path),
  })
  const store = { collection: (col) => ({ doc: (id) => ref(col, id) }) }
  const tx = {
    get: async (r) => snapOf(r),
    getAll: async (...refs) => refs.map(snapOf),
    set: (r, value, opts) =>
      data.set(r.path, opts?.merge ? { ...data.get(r.path), ...value } : value),
  }
  return { data, store, tx }
}

describe('語の画像を書く口', () => {
  it('タグ付きの枠はその出典の語、タグ無しは枠の先頭の語に書く', async () => {
    const built = fromLegacy({
      numbers: [
        {
          num: '043',
          hito: '',
          mono: '',
          slots: { wh1: slot('ミタ#a#b'), wm1: slot('火') },
        },
      ],
    })
    const { data, store, tx } = fakeFirestore(built)
    const plan = await prepareWordImage(store, tx, '043', 'w1#b')
    const wordId = commitWordImage(store, tx, plan, 'u1')
    expect(data.get(`words/${wordId}`)).toMatchObject({
      text: 'ミタ',
      source: 'b',
      imageUrl: 'u1',
    })
    const plan2 = await prepareWordImage(store, tx, '043', 'w2')
    const fire = commitWordImage(store, tx, plan2, 'u2')
    expect(data.get(`words/${fire}`)).toMatchObject({
      text: '火',
      imageUrl: 'u2',
    })
  })

  it('slot-store は画像が変わったときだけ語の画像を書く', async () => {
    const calls = []
    const col = { doc: (id) => ({ id }) }
    const stored = new Map()
    const runTransaction = (fn) =>
      fn({
        get: async (r) => ({
          exists: stored.has(r.id),
          data: () => stored.get(r.id),
        }),
        set: (r, v) => stored.set(r.id, v),
      })
    const slots = createSlotStore({
      col,
      runTransaction,
      wordImage: {
        prepare: async () => 'plan',
        commit: (_tx, plan, url) => calls.push([plan, url]),
      },
    })
    await slots.update('043', 'w1', () => ({ doc: { image: { url: 'u1' } } }))
    await slots.update('043', 'w1', () => ({
      doc: { image: { url: 'u1' }, keep: true },
    }))
    expect(calls).toEqual([['plan', 'u1']])
  })
})
