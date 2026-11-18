import { describe, expect, it } from 'vitest'
import { marksView } from '../../src/images/slot-docs.js'
import { createSlotStore } from '../../src/images/slot-store.js'
import { handleConsoleRequest } from '../console-route.js'

const NOW = '2026-11-18T00:00:00.000Z'

const state = {
  kinds: { num: { slots: ['w1', 'w2'] } },
  targets: [
    { id: '001', kind: 'num' },
    { id: '002', kind: 'num', slots: ['w1', 'w1#res'] },
  ],
}

const img = (hash) => ({ url: `https://example.test/${hash}.webp`, hash })

/** imageSlots だけを持つ Firestore のモック。読んだ回数も数える */
function fakeFirestore(initial) {
  const docs = { ...initial }
  const reads = { full: 0, since: 0 }
  const snapOf = (id) => ({
    id,
    exists: docs[id] !== undefined,
    data: () => docs[id],
  })
  const all = () => Object.keys(docs).map(snapOf)
  const col = {
    doc: (id) => ({ id }),
    get: async () => {
      reads.full++
      return { docs: all() }
    },
    where: (field, _op, value) => ({
      get: async () => {
        reads.since++
        return { docs: all().filter((s) => (s.data()[field] ?? '') > value) }
      },
    }),
  }
  const runTransaction = (fn) =>
    fn({
      get: async (ref) => snapOf(ref.id),
      set: (ref, value) => {
        docs[ref.id] = value
      },
    })
  return { docs, reads, slots: createSlotStore({ col, runTransaction }) }
}

const initialDocs = () => ({
  '001:w1': {
    id: '001',
    slot: 'w1',
    image: img('a'),
    keep: true,
    redo: null,
    candidate: null,
    history: [],
  },
})

function setup() {
  const fs = fakeFirestore(initialDocs())
  const request = (method, path, body) =>
    handleConsoleRequest({
      method,
      path,
      body,
      state,
      slots: fs.slots,
      view: marksView,
      now: NOW,
    })
  return { ...fs, request }
}

describe('handleConsoleRequest', () => {
  it('焼いた対象に、正本の画像と印を重ねて返す', async () => {
    const { request } = setup()
    const res = await request('GET', '/console/state', {})
    expect(res.status).toBe(200)
    expect(res.payload.targets).toBe(state.targets)
    expect(res.payload.images['001'].w1.hash).toBe('a')
    expect(res.payload.keep).toEqual({ '001:w1': true })
  })

  it('ロックの印を正本に書き、keep の一覧を返す', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/keep', {
      id: '001',
      slot: 'w2',
      on: true,
    })
    expect(res.status).toBe(200)
    expect(res.payload.keep).toEqual({ '001:w1': true, '001:w2': true })
    expect(docs['001:w2']).toMatchObject({ keep: true, updatedAt: NOW })
  })

  it('タグ違いで分けた枠は targets の slots にあれば通す', async () => {
    const { request } = setup()
    const res = await request('POST', '/console/redo', {
      id: '002',
      slot: 'w1#res',
      on: true,
    })
    expect(res.status).toBe(200)
    expect(res.payload.redo['002:w1#res'].flaggedAt).toBe(NOW)
  })

  it('撮り直しの印を外すと redo の一覧から消える', async () => {
    const { request } = setup()
    const body = { id: '002', slot: 'w1', on: true }
    await request('POST', '/console/redo', body)
    const res = await request('POST', '/console/redo', { ...body, on: false })
    expect(res.payload.redo).toEqual({})
  })

  it('焼いた targets に無い枠は断る', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/keep', {
      id: '001',
      slot: 'w1#res',
      on: true,
    })
    expect(res.status).toBe(400)
    expect(docs['001:w1#res']).toBeUndefined()
  })

  it('ロック中の枠に撮り直しの印は付けない', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/redo', {
      id: '001',
      slot: 'w1',
      on: true,
    })
    expect(res.status).toBe(409)
    expect(docs['001:w1'].redo).toBeNull()
  })

  it('全件を読むのは最初の 1 回だけ。あとは更新分だけ読み足す', async () => {
    const { request, reads, docs } = setup()
    await request('GET', '/console/state', {})
    await request('POST', '/console/keep', { id: '001', slot: 'w2', on: true })
    // Mac の同期が別の枠を書いた
    docs['002:w1'] = {
      ...initialDocs()['001:w1'],
      id: '002',
      image: img('mac'),
      updatedAt: NOW,
    }
    const res = await request('GET', '/console/state', {})
    expect(reads.full).toBe(1)
    expect(res.payload.images['002'].w1.hash).toBe('mac')
  })

  it('書き込みは POST だけ', async () => {
    const { request } = setup()
    expect((await request('GET', '/console/keep', {})).status).toBe(405)
  })

  it('担当外の経路は null', async () => {
    const { request } = setup()
    expect(await request('GET', '/console/other', {})).toBeNull()
  })
})
