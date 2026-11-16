import { describe, expect, it, vi } from 'vitest'
import * as marks from '../../src/images/marks.js'
import { handleConsoleRequest } from '../console-route.js'

const NOW = '2026-11-16T00:00:00.000Z'

const state = {
  kinds: { num: { slots: ['w1', 'w2'] } },
  targets: [
    { id: '001', kind: 'num' },
    { id: '002', kind: 'num', slots: ['w1', 'w1#res'] },
  ],
  images: {},
  keep: { '001:w1': true },
  redo: {},
}

function makeDb(list = []) {
  const saved = []
  return {
    saved,
    listMarks: vi.fn(async () => list),
    setMark: vi.fn(async (mark) => saved.push(mark)),
  }
}

const request = (method, path, body, db = makeDb()) =>
  handleConsoleRequest({ method, path, body, state, db, marks, now: NOW })

describe('handleConsoleRequest', () => {
  it('state に web の印を重ねて返す', async () => {
    const db = makeDb([{ id: '001', slot: 'w1', keep: false }])
    const res = await request('GET', '/console/state', {}, db)
    expect(res.status).toBe(200)
    expect(res.payload.keep).toEqual({})
    expect(res.payload.targets).toBe(state.targets)
  })

  it('ロックの印を書き、重ねた keep を返す', async () => {
    const db = makeDb()
    const body = { id: '001', slot: 'w2', on: true }
    const res = await request('POST', '/console/keep', body, db)
    expect(res.status).toBe(200)
    expect(res.payload.keep).toEqual({ '001:w1': true, '001:w2': true })
    expect(db.saved).toEqual([{ id: '001', slot: 'w2', at: NOW, keep: true }])
  })

  it('タグ違いで分けた枠は targets の slots にあれば通す', async () => {
    const body = { id: '002', slot: 'w1#res', on: true }
    const res = await request('POST', '/console/redo', body)
    expect(res.status).toBe(200)
    expect(res.payload.redo['002:w1#res'].flaggedAt).toBe(NOW)
  })

  it('焼いた targets に無い枠は断る', async () => {
    const db = makeDb()
    const body = { id: '001', slot: 'w1#res', on: true }
    const res = await request('POST', '/console/keep', body, db)
    expect(res.status).toBe(400)
    expect(db.setMark).not.toHaveBeenCalled()
  })

  it('ロック中の枠に撮り直しの印は付けない', async () => {
    const db = makeDb()
    const body = { id: '001', slot: 'w1', on: true }
    const res = await request('POST', '/console/redo', body, db)
    expect(res.status).toBe(409)
    expect(db.setMark).not.toHaveBeenCalled()
  })

  it('書き込みは POST だけ', async () => {
    const res = await request('GET', '/console/keep', {})
    expect(res.status).toBe(405)
  })

  it('担当外の経路は null', async () => {
    expect(await request('GET', '/console/other', {})).toBeNull()
  })
})
