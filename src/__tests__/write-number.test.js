import { describe, expect, it } from 'vitest'
import { writeNumber } from '../firestore/write.js'

const now = '2026-08-20T00:00:00.000Z'

const base = {
  num: '051',
  hito: '鯉',
  mono: '',
  gainen: '',
  slots: { wh1: { word: '鯉', kana: 'こい', imageUrl: '' } },
  updatedAt: now,
  source: 'console',
}

const stored = {
  ...base,
  rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: true },
  ratings: [{ k: 'こい', w: '鯉', v: 2 }],
  updatedAt: '2026-01-01T00:00:00.000Z',
}

/**
 * トランザクションを模した最小の DB。
 * Firestore と同じく、get した後に他者が書いていたら commit を中断する。
 */
function fakeDb(initial = {}, { mutateAfterGet } = {}) {
  const docs = { ...initial }
  return {
    docs,
    async runTransaction(fn) {
      const readAt = {}
      const result = await fn({
        get: async (num) => {
          const value = docs[num]
          readAt[num] = value
          mutateAfterGet?.(docs, num)
          return value
        },
        set: async (num, doc) => {
          // Firestore は読んだ後に変わっていれば commit を弾く
          if (docs[num] !== readAt[num]) {
            throw new Error('transaction aborted: document changed')
          }
          docs[num] = doc
        },
      })
      return result
    },
  }
}

describe('writeNumber — the single write gate', () => {
  it('REQ-FS-007: rejects an invalid document before persisting', async () => {
    const db = fakeDb()
    const result = await writeNumber(db, {
      num: '051',
      doc: { ...base, ratings: [{ k: 'こい', w: '鯉', v: 9 }] },
    })

    expect(result).toMatchObject({ error: 'invalid rating' })
    expect(db.docs['051']).toBeUndefined()
  })

  it('REQ-FS-007: rejects a write that would drop an existing rep', async () => {
    const db = fakeDb({ '051': stored })
    const result = await writeNumber(db, { num: '051', doc: base })

    expect(result).toMatchObject({ error: 'rep would be dropped' })
    expect(db.docs['051']).toEqual(stored)
  })

  it('REQ-DRV-001: recomputes derived before persisting', async () => {
    const db = fakeDb()
    await writeNumber(db, { num: '051', doc: base })

    expect(db.docs['051'].derived.rankeyBySlot.wh1).toBe('_AA|')
  })

  it('REQ-FS-005: throws away any derived the caller supplied', async () => {
    const db = fakeDb()
    const result = await writeNumber(db, {
      num: '051',
      doc: { ...base, derived: { ptBySlot: { wh1: 999 } } },
    })

    // 呼び出し元の derived は検証で弾かれる (サーバ所有)
    expect(result).toMatchObject({ error: 'derived is server-owned' })
  })

  it('REQ-FS-012: aborts when the document changed between plan and apply', async () => {
    // 同期はまとめて読んでプランを作り、後から適用する。その間にコンソールから
    // 編集が入ると、素朴な上書きは rep を巻き戻してしまう
    const edited = { ...stored, updatedAt: '2026-08-21T00:00:00.000Z' }
    const db = fakeDb({ '051': edited })

    const result = await writeNumber(db, {
      num: '051',
      doc: { ...base, rep: stored.rep, ratings: stored.ratings },
      expectedUpdatedAt: stored.updatedAt, // プランを作った時点の値
    })

    expect(result).toMatchObject({ error: 'conflict' })
    expect(db.docs['051']).toEqual(edited)
  })

  it('REQ-FS-011: lets the transaction abort surface instead of writing anyway', async () => {
    // get の直後に他者が書いた場合は DB 側が commit を弾く
    const db = fakeDb(
      { '051': stored },
      {
        mutateAfterGet: (docs) => {
          docs['051'] = { ...stored, updatedAt: '2026-08-21T00:00:00.000Z' }
        },
      }
    )

    await expect(
      writeNumber(db, {
        num: '051',
        doc: { ...base, rep: stored.rep, ratings: stored.ratings },
      })
    ).rejects.toThrow(/transaction aborted/)
  })

  it('REQ-FS-012: proceeds when the document is untouched', async () => {
    const db = fakeDb({ '051': stored })
    const result = await writeNumber(db, {
      num: '051',
      doc: { ...base, rep: stored.rep, ratings: stored.ratings },
      expectedUpdatedAt: stored.updatedAt,
    })

    expect(result.ok).toBe(true)
    expect(db.docs['051'].slots.wh1.kana).toBe('こい')
  })

  it('accepts a first write when nothing exists yet', async () => {
    const db = fakeDb()
    const result = await writeNumber(db, {
      num: '051',
      doc: base,
      expectedUpdatedAt: null,
    })

    expect(result.ok).toBe(true)
    expect(db.docs['051'].num).toBe('051')
  })

  it('REQ-FS-008: an undeclared change to rep is treated as an accident', async () => {
    // 意図を宣言しなければ、rep を書き換える文書は通らない。
    // 全文書上書きで «ついでに» 消す経路を塞ぐのがこのガードの狙い
    const db = fakeDb({ '051': stored })
    const result = await writeNumber(db, {
      num: '051',
      doc: {
        ...base,
        rep: { picks: [], confirmed: false },
        ratings: stored.ratings,
      },
    })

    expect(result).toMatchObject({ error: 'rep would be overwritten' })
    expect(db.docs['051']).toEqual(stored)
  })

  it('REQ-FS-008: the same change goes through once declared', async () => {
    const db = fakeDb({ '051': stored })
    const result = await writeNumber(db, {
      num: '051',
      doc: {
        ...base,
        rep: { picks: [], confirmed: false },
        ratings: stored.ratings,
      },
      intent: ['rep'],
    })

    expect(result.ok).toBe(true)
    expect(db.docs['051'].rep.picks).toEqual([])
    // 宣言していない ratings は元のまま
    expect(db.docs['051'].ratings).toEqual(stored.ratings)
  })

  it('REQ-FS-008: declaring one field does not license losing the other', async () => {
    const db = fakeDb({ '051': stored })
    const result = await writeNumber(db, {
      num: '051',
      doc: { ...base, rep: { picks: [], confirmed: false } },
      intent: ['rep'],
    })

    expect(result).toMatchObject({ error: 'ratings would be dropped' })
  })

  it('REQ-FS-002: refuses when the id and num disagree', async () => {
    const db = fakeDb()
    const result = await writeNumber(db, { num: '052', doc: base })

    expect(result).toMatchObject({ error: 'id mismatch' })
    expect(db.docs['052']).toBeUndefined()
  })
})
