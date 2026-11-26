// 番号の保存 (writeNumber) が、同じ transaction で新しい形にも書くこと (計画 P3-2・P3-3)
import { describe, expect, it } from 'vitest'
import {
  commitNumberWrite,
  prepareNumberWrite,
  SYMBOLS,
  WORDS,
} from '../db4/write-layer.js'
import { shapeErrors } from '../db4/schema.js'
import { writeNumber } from '../firestore/write.js'

/** メモリ上の Firestore。transaction は書きを溜めて最後にまとめて反映し、投げたら捨てる */
function memoryDb() {
  const cols = {
    numbers: new Map(),
    [SYMBOLS]: new Map(),
    [WORDS]: new Map(),
    tags: new Map(),
    snapshots: new Map(),
    meta: new Map(),
  }
  const db = {
    cols,
    async runTransaction(fn) {
      const writes = []
      const io = {
        getDocs: async (col, ids) =>
          ids.map((id) =>
            cols[col].has(id) ? { id, ...cols[col].get(id) } : undefined
          ),
        listTags: async () =>
          [...(cols.tags ?? new Map())].map(([id, t]) => ({ id, ...t })),
        findSymbolsUsing: async (wordIds) =>
          [...cols[SYMBOLS]]
            .filter(([, s]) => s.wordIds.some((id) => wordIds.includes(id)))
            .map(([id, s]) => ({ id, ...s })),
        set: (col, id, data) => writes.push(() => cols[col].set(id, data)),
        remove: (col, id) => writes.push(() => cols[col].delete(id)),
      }
      const result = await fn({
        get: async (num) => cols.numbers.get(num),
        set: async (num, doc) => writes.push(() => cols.numbers.set(num, doc)),
        prepareMirror: (num) => prepareNumberWrite(io, num),
        mirror: async (_num, doc, plan) => commitNumberWrite(io, plan, doc),
      })
      for (const write of writes) write()
      return result
    },
  }
  return db
}

const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })
const save = (db, slots, expectedUpdatedAt) =>
  writeNumber(db, {
    num: '106',
    doc: {
      num: '106',
      hito: '',
      mono: '',
      slots,
      updatedAt: `t${Date.now()}`,
      source: 'app',
    },
    expectedUpdatedAt,
    intent: ['slots', 'hito', 'mono'],
  })

describe('writeNumber + 新しい形 (DB4_WRITE)', () => {
  it('保存すると記号と語ができ、形の検査を通る', async () => {
    const db = memoryDb()
    const r = await save(db, {
      wh1: slot('トロ', 'とろ'),
      wm1: slot('火', 'ひ'),
    })
    expect(r.ok).toBe(true)
    const symbol = db.cols[SYMBOLS].get('num:106')
    expect(symbol.wordIds).toHaveLength(2)
    expect(db.cols[WORDS].size).toBe(2)
    const words = [...db.cols[WORDS]].map(([id, w]) => ({ id, ...w }))
    expect(
      shapeErrors({ symbols: [{ id: 'num:106', ...symbol }], words })
    ).toEqual([])
  })

  it('語を消して保存すると、どこからも指されない語の文書も消える', async () => {
    const db = memoryDb()
    await save(db, { wh1: slot('トロ'), wh2: slot('マイ') })
    const before = db.cols.numbers.get('106').updatedAt
    const r = await save(db, { wh1: slot('トロ') }, before)
    expect(r.ok).toBe(true)
    expect([...db.cols[WORDS].values()].map((w) => w.text)).toEqual(['トロ'])
  })

  it('新しい形が作れなければ、numbers にも書かずに止める', async () => {
    const db = memoryDb()
    await save(db, { wh1: slot('トロ') })
    // 壊れた語 (ID の形が違う) を仕込む
    const symbol = db.cols[SYMBOLS].get('num:106')
    const [wordId] = symbol.wordIds
    const word = db.cols[WORDS].get(wordId)
    db.cols[WORDS].delete(wordId)
    db.cols[WORDS].set('bad-id', word)
    db.cols[SYMBOLS].set('num:106', {
      ...symbol,
      wordIds: ['bad-id'],
      links: symbol.links.map((l) => ({ ...l, wordId: 'bad-id' })),
    })
    const before = db.cols.numbers.get('106')
    const r = await save(
      db,
      { wh1: slot('トロ'), wh2: slot('マイ') },
      before.updatedAt
    )
    expect(r.error).toBe('db4_invalid')
    expect(db.cols.numbers.get('106')).toBe(before)
  })
})
