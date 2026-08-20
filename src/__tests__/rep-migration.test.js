import { describe, expect, it } from 'vitest'
import {
  countOf,
  planRepMigration,
  reconcile,
} from '../firestore/rep-migration.js'

const now = '2026-08-20T00:00:00.000Z'

const store = {
  version: 2,
  rep: {
    '051': { picks: [{ k: 'こい', w: '鯉' }], confirmed: true },
    '052': {
      picks: [
        { k: 'こいび', w: '恋人' },
        { k: 'こいん', w: 'コイン' },
      ],
      confirmed: true,
    },
  },
  scores: {
    '051': [{ k: 'こい', w: '鯉', v: 2 }],
  },
}

const target = (num, slots) => ({
  num,
  slots,
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'sheet',
})

const existing = {
  '051': target('051', {
    wh1: { word: '鯉', kana: 'こい', imageUrl: '' },
  }),
  '052': target('052', {
    wh1: { word: '恋人', kana: 'こいび', imageUrl: '' },
    wm1: { word: 'コイン', kana: 'こいん', imageUrl: '' },
  }),
}

describe('word-rep.json migration', () => {
  it('REQ-MIG-001/002: copies rep and ratings onto the number documents', () => {
    const plan = planRepMigration({ store, existing, now })

    expect(plan.writes).toHaveLength(2)
    const first = plan.writes.find((w) => w.num === '051')
    expect(first.doc.rep.picks).toEqual([{ k: 'こい', w: '鯉' }])
    expect(first.doc.ratings).toEqual([{ k: 'こい', w: '鯉', v: 2 }])
  })

  it('REQ-MIG-003: keeps a value that no longer resolves, marked stale', () => {
    const moved = {
      ...existing,
      '051': target('051', { wh1: { word: '恋', kana: 'こい', imageUrl: '' } }),
    }
    const plan = planRepMigration({ store, existing: moved, now })
    const first = plan.writes.find((w) => w.num === '051')

    // 値そのものは捨てない
    expect(first.doc.rep.picks[0]).toMatchObject({
      k: 'こい',
      w: '鯉',
      stale: true,
    })
  })

  it('REQ-MIG-003: a tag-only change is not stale', () => {
    const tagged = {
      ...existing,
      '051': target('051', {
        wh1: { word: '鯉#g', kana: 'こい', imageUrl: '' },
      }),
    }
    const plan = planRepMigration({ store, existing: tagged, now })
    const first = plan.writes.find((w) => w.num === '051')

    expect('stale' in first.doc.rep.picks[0]).toBe(false)
  })

  it('REQ-MIG-005: refuses to overwrite a number that already has rep', () => {
    const occupied = {
      ...existing,
      '051': {
        ...existing['051'],
        rep: { picks: [{ k: 'x', w: 'X' }], confirmed: false },
      },
    }
    const plan = planRepMigration({ store, existing: occupied, now })

    expect(plan.blocked).toEqual(['051'])
    expect(plan.writes.map((w) => w.num)).toEqual(['052'])
  })

  it('REQ-MIG-005: also refuses when only ratings are already present', () => {
    const occupied = {
      ...existing,
      '051': { ...existing['051'], ratings: [{ k: 'x', w: 'X', v: 1 }] },
    }

    expect(
      planRepMigration({ store, existing: occupied, now }).blocked
    ).toEqual(['051'])
  })

  it('does not invent a number document that does not exist yet', () => {
    const plan = planRepMigration({
      store,
      existing: { '051': existing['051'] },
      now,
    })

    expect(plan.missing).toEqual(['052'])
    expect(plan.writes.map((w) => w.num)).toEqual(['051'])
  })

  it('REQ-MIG-004: reconciles the counts before and after', () => {
    const plan = planRepMigration({ store, existing, now })

    expect(countOf(store)).toEqual({ reps: 2, picks: 3, ratings: 1 })
    expect(reconcile(plan, store)).toMatchObject({ ok: true })
  })

  it('REQ-MIG-004: reports a mismatch when a pick is silently dropped', () => {
    const plan = planRepMigration({ store, existing, now })
    // 移行中に 1 件落ちた状況を作る
    plan.writes.find((w) => w.num === '052').doc.rep.picks.pop()

    expect(reconcile(plan, store)).toMatchObject({ error: 'count mismatch' })
  })

  it('REQ-MIG-004: skipped numbers are excluded from the reconciliation', () => {
    const plan = planRepMigration({
      store,
      existing: { '051': existing['051'] },
      now,
    })

    // 052 は移行先が無いので対象外。残りだけで帳尻が合えば ok
    expect(reconcile(plan, store)).toMatchObject({ ok: true, skipped: ['052'] })
  })

  it('never mutates the source store', () => {
    const before = JSON.stringify(store)
    planRepMigration({ store, existing, now })

    expect(JSON.stringify(store)).toBe(before)
  })

  it('carries the read-time updatedAt so the apply step can detect conflicts', () => {
    const plan = planRepMigration({ store, existing, now })

    expect(plan.writes[0].expectedUpdatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
