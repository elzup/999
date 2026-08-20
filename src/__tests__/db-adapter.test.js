// db.js は Firestore を writeNumber が期待する形に包む層。
// 実 DB には繋がず、Firestore 側の API を模して «包み方» だけを確かめる。
// ここが唯一テストの無い層だった。

import { describe, expect, it, vi } from 'vitest'

/** Firestore の最小モック。呼ばれ方を記録する */
function fakeStore() {
  const written = []
  const docs = { '051': { num: '051', slots: {} } }

  const docRef = (col, id) => ({
    col,
    id,
    get: async () => ({ exists: docs[id] !== undefined, data: () => docs[id] }),
  })
  const store = {
    collection: (col) => ({ doc: (id) => docRef(col, id) }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => ({
          exists: docs[ref.id] !== undefined,
          data: () => docs[ref.id],
        }),
        set: (ref, value) => written.push({ col: ref.col, id: ref.id, value }),
      }),
    batch: () => ({
      set: (ref, value) => written.push({ col: ref.col, id: ref.id, value }),
      commit: async () => {},
    }),
  }
  return { store, written, docs }
}

/** firebase-admin を差し替えて connect を読む */
async function loadConnect(store) {
  vi.resetModules()
  vi.doMock('firebase-admin/app', () => ({
    getApps: () => [{ name: 'test' }],
    initializeApp: () => ({ name: 'test' }),
    cert: (v) => v,
  }))
  vi.doMock('firebase-admin/firestore', () => ({ getFirestore: () => store }))
  return (await import('../firestore/db.js')).connect
}

describe('firestore adapter', () => {
  it('exposes a transaction shaped the way writeNumber expects', async () => {
    const { store, written } = fakeStore()
    const connect = await loadConnect(store)
    const db = connect({ projectId: 'test' })

    const result = await db.runTransaction(async (tx) => {
      const current = await tx.get('051')
      await tx.set('051', { ...current, touched: true })
      return 'done'
    })

    expect(result).toBe('done')
    expect(written).toEqual([
      {
        col: 'numbers',
        id: '051',
        value: { num: '051', slots: {}, touched: true },
      },
    ])
  })

  it('returns undefined for a document that does not exist', async () => {
    const { store } = fakeStore()
    const connect = await loadConnect(store)
    const db = connect({ projectId: 'test' })

    // writeNumber は «未作成» を undefined で判定する。null だと分岐が狂う
    const seen = await db.runTransaction((tx) => tx.get('999'))
    expect(seen).toBeUndefined()
  })

  it('writes chunks into the bundles collection, not numbers', async () => {
    const { store, written } = fakeStore()
    const connect = await loadConnect(store)
    const db = connect({ projectId: 'test' })

    const count = await db.writeChunks([
      { id: 'chunk_0', builtAt: 'T', numbers: [] },
      { id: 'chunk_1', builtAt: 'T', numbers: [] },
    ])

    expect(count).toBe(2)
    expect(written.map((w) => w.col)).toEqual(['bundles', 'bundles'])
    expect(written.map((w) => w.id)).toEqual(['chunk_0', 'chunk_1'])
  })

  it('reads a chunk and reports a missing one as null', async () => {
    const { store, docs } = fakeStore()
    docs.chunk_0 = { id: 'chunk_0', numbers: [] }
    const connect = await loadConnect(store)
    const db = connect({ projectId: 'test' })

    expect(await db.readChunk('chunk_0')).toEqual({
      id: 'chunk_0',
      numbers: [],
    })
    expect(await db.readChunk('chunk_9')).toBe(null)
  })
})
