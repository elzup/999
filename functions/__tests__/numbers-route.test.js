import { describe, expect, it, vi } from 'vitest'
import { handleNumbersRequest } from '../numbers-route.js'

const NOW = '2026-08-28T00:00:00.000Z'

const doc = (over = {}) => ({
  num: '051',
  updatedAt: '2026-08-27T00:00:00.000Z',
  slots: { wh1: { word: '鯉', kana: 'こい' } },
  rep: { picks: [], confirmed: false },
  ratings: [],
  ...over,
})

/** 書き込み関数は呼ばれたかどうかだけ見る。中身は console-writes 側でテスト済み */
function makeWrites(result = { ok: true, doc: doc({ updatedAt: NOW }) }) {
  return {
    saveRep: vi.fn(async () => result),
    saveRating: vi.fn(async () => result),
    saveSlots: vi.fn(async () => result),
    confirmImage: vi.fn(async () => result),
  }
}

const makeDb = (current) => ({ readNumber: vi.fn(async () => current) })

describe('handleNumbersRequest', () => {
  it('返すのは 1 番号ぶんの文書だけ (REQ-NAPI-001)', async () => {
    const res = await handleNumbersRequest({
      method: 'GET',
      num: '051',
      db: makeDb(doc()),
      writes: makeWrites(),
      now: NOW,
    })

    expect(res.status).toBe(200)
    expect(res.payload.number.num).toBe('051')
  })

  it('3 桁でない番号はストアに触れず 400 (REQ-NAPI-005)', async () => {
    const db = makeDb(doc())
    const res = await handleNumbersRequest({
      method: 'GET',
      num: '5',
      db,
      writes: makeWrites(),
      now: NOW,
    })

    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('invalid_num')
    expect(db.readNumber).not.toHaveBeenCalled()
  })

  it('本文が上限を超えたら書き込まない (REQ-NAPI-005)', async () => {
    const writes = makeWrites()
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rating', k: 'こい', w: 'x'.repeat(5000), v: 2 },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(res.status).toBe(413)
    expect(writes.saveRating).not.toHaveBeenCalled()
  })

  it('読み取り時点より進んでいたら操作を組み立てずに 409 (REQ-NAPI-006)', async () => {
    const writes = makeWrites()
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rep', picks: [], expectedUpdatedAt: '2026-08-01T00:00:00Z' },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(res.status).toBe(409)
    expect(res.payload.actual).toBe('2026-08-27T00:00:00.000Z')
    expect(writes.saveRep).not.toHaveBeenCalled()
  })

  it('評価は ratings の書き込み口だけを通る (REQ-NAPI-003)', async () => {
    const writes = makeWrites()
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rating', k: 'こい', w: '鯉', v: 2 },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(res.status).toBe(200)
    expect(writes.saveRating).toHaveBeenCalledOnce()
    expect(writes.saveRep).not.toHaveBeenCalled()
    expect(writes.confirmImage).not.toHaveBeenCalled()
  })

  it('v 未指定は未評価 (null) として渡す。0 で埋めない (REQ-CON-003)', async () => {
    const writes = makeWrites()
    await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rating', k: 'こい', w: '鯉' },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(writes.saveRating.mock.calls[0][1].v).toBeNull()
  })

  it('語の編集・並べ替え・削除は slots の書き込み口だけを通る', async () => {
    const writes = makeWrites()
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'slots', slots: { wh1: { word: '恋', kana: 'こい' } } },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(res.status).toBe(200)
    expect(writes.saveSlots).toHaveBeenCalledOnce()
    expect(writes.saveRep).not.toHaveBeenCalled()
    expect(writes.saveRating).not.toHaveBeenCalled()
  })

  it('知らない op は書き込まず 400', async () => {
    const writes = makeWrites()
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'hito', value: '鯉' },
      db: makeDb(doc()),
      writes,
      now: NOW,
    })

    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('unknown op')
    expect(writes.saveRep).not.toHaveBeenCalled()
  })

  it('書き込み口が返した conflict は 409 に写す (REQ-NAPI-004 の兄弟)', async () => {
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rep', picks: [] },
      db: makeDb(doc()),
      writes: makeWrites({ error: 'conflict' }),
      now: NOW,
    })

    expect(res.status).toBe(409)
  })

  it('保護対象を壊す書き込みの拒否は 4xx として返る (REQ-NAPI-004)', async () => {
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '051',
      body: { op: 'rep', picks: [] },
      db: makeDb(doc()),
      writes: makeWrites({ error: 'would drop ratings' }),
      now: NOW,
    })

    expect(res.status).toBe(400)
    expect(res.payload.ok).toBe(false)
  })

  it('存在しない番号は 404', async () => {
    const res = await handleNumbersRequest({
      method: 'PATCH',
      num: '999',
      body: { op: 'rep', picks: [] },
      db: makeDb(undefined),
      writes: makeWrites(),
      now: NOW,
    })

    expect(res.status).toBe(404)
  })

  it('GET / PATCH 以外は 405', async () => {
    const res = await handleNumbersRequest({
      method: 'DELETE',
      num: '051',
      db: makeDb(doc()),
      writes: makeWrites(),
      now: NOW,
    })

    expect(res.status).toBe(405)
  })
})
