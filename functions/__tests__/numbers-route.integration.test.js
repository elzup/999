// 経路を実物で通す。モックは Firestore の口 (runTransaction / readNumber) だけ。
// spec: .vsdd/firestore-store/specs/spec-number-api.md
//
// 単体テストは writes を差し替えているので、«ルートが呼んだ» ことしか言えない。
// ここでは実際の console-writes → writeNumber → validateNumberDoc → derived を
// 通し、保存後の文書が本当に不変条件を満たすかまで見る。
//
// 読むのは functions/lib (デプロイされる写し)。src/ を直接読むと、
// sync-functions-lib.sh の写し漏れをテストが素通りさせてしまう。

import { describe, expect, it, beforeAll } from 'vitest'
import { handleNumbersRequest } from '../numbers-route.js'

let writes

beforeAll(async () => {
  writes = await import('../lib/firestore/console-writes.js')
})

const NOW = '2026-08-30T00:00:00.000Z'

const seed = () => ({
  num: '051',
  hito: '',
  mono: '',
  gainen: '',
  slots: {
    wh1: { word: '鯉', kana: 'こい', imageUrl: '' },
    wh2: { word: '恋', kana: 'こい', imageUrl: '' },
  },
  rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: false },
  ratings: [{ k: 'こい', w: '鯉', v: 2 }],
  updatedAt: '2026-08-29T00:00:00.000Z',
  source: 'sheet',
})

/** Firestore の代わり。1 番号だけを持つ最小の口 */
function fakeDb(initial) {
  const store = new Map([[initial.num, initial]])
  return {
    store,
    async readNumber(num) {
      return store.get(num)
    },
    async runTransaction(fn) {
      return fn({
        get: async (num) => store.get(num),
        set: async (num, doc) => void store.set(num, doc),
      })
    },
  }
}

const patch = (db, body) =>
  handleNumbersRequest({
    method: 'PATCH',
    num: '051',
    body,
    db,
    writes,
    now: NOW,
  })

describe('numbers API を実物の書き込み経路で通す', () => {
  it('評価を足しても代表が消えない (REQ-FS-008 / REQ-CON-002)', async () => {
    const db = fakeDb(seed())
    const res = await patch(db, { op: 'rating', k: 'こい', w: '恋', v: 1 })

    expect(res.status).toBe(200)
    const saved = db.store.get('051')
    expect(saved.rep).toEqual({
      picks: [{ k: 'こい', w: '鯉' }],
      confirmed: false,
    })
    expect(saved.ratings).toContainEqual({ k: 'こい', w: '恋', v: 1 })
  })

  it('代表を書いても評価が消えない (REQ-CON-001)', async () => {
    const db = fakeDb(seed())
    const res = await patch(db, {
      op: 'rep',
      picks: [{ k: 'こい', w: '恋' }],
      confirmed: true,
    })

    expect(res.status).toBe(200)
    const saved = db.store.get('051')
    expect(saved.ratings).toEqual([{ k: 'こい', w: '鯉', v: 2 }])
    expect(saved.rep.confirmed).toBe(true)
  })

  it('保存のたびに derived を計算し直す (REQ-FS-005)', async () => {
    const db = fakeDb(seed())
    const res = await patch(db, { op: 'rating', k: 'こい', w: '鯉', v: 0 })

    const saved = db.store.get('051')
    // 入力に derived を入れていないのに、書き込み経路が付ける
    expect(Object.keys(saved.derived ?? {})).toEqual([
      'ptBySlot',
      'rankeyBySlot',
    ])
    expect(saved.derived.rankeyBySlot.wh1).toBeTypeOf('string')
    expect(res.payload.number.derived.rankeyBySlot.wh1).toBe(
      saved.derived.rankeyBySlot.wh1
    )
  })

  it('アプリからの書き込みは source=app として残る', async () => {
    const db = fakeDb(seed())
    await patch(db, { op: 'rating', k: 'こい', w: '鯉', v: 1 })

    expect(db.store.get('051').source).toBe('app')
    expect(db.store.get('051').updatedAt).toBe(NOW)
  })

  it('評価を null で送ると行ごと消える。0 では残らない (REQ-CON-003)', async () => {
    const db = fakeDb(seed())
    await patch(db, { op: 'rating', k: 'こい', w: '鯉', v: null })

    expect(db.store.get('051').ratings).toEqual([])
  })

  it('代表は 2 件を超えて保存できない (design:firestore-schema)', async () => {
    const db = fakeDb(seed())
    const res = await patch(db, {
      op: 'rep',
      picks: [
        { k: 'こい', w: '鯉' },
        { k: 'こい', w: '恋' },
        { k: 'こいん', w: 'コイン' },
      ],
      confirmed: false,
    })

    expect(res.status).toBe(400)
    expect(res.payload.error).toBe('too many picks')
    // 拒否されたら 1 バイトも書かない
    expect(db.store.get('051').rep.picks).toHaveLength(1)
  })

  it('許容外の評価値は書き込まない', async () => {
    const db = fakeDb(seed())
    const res = await patch(db, { op: 'rating', k: 'こい', w: '鯉', v: 5 })

    expect(res.status).toBe(400)
    expect(db.store.get('051').ratings).toEqual([{ k: 'こい', w: '鯉', v: 2 }])
  })

  it('読んでから書くまでに他の面が書いていたら諦める (REQ-FS-012)', async () => {
    const db = fakeDb(seed())
    const current = await db.readNumber('051')

    // 画面が読んだ後にコンソールが書いた状況を作る
    db.store.set('051', { ...current, updatedAt: '2026-08-29T12:00:00.000Z' })

    const res = await patch(db, {
      op: 'rating',
      k: 'こい',
      w: '鯉',
      v: 1,
      expectedUpdatedAt: current.updatedAt,
    })

    expect(res.status).toBe(409)
    expect(db.store.get('051').ratings).toEqual([{ k: 'こい', w: '鯉', v: 2 }])
  })

  it('GET は保存された文書をそのまま返す', async () => {
    const db = fakeDb(seed())
    const res = await handleNumbersRequest({
      method: 'GET',
      num: '051',
      db,
      writes,
      now: NOW,
    })

    expect(res.status).toBe(200)
    expect(res.payload.number.slots.wh1.word).toBe('鯉')
  })
})
