import { describe, expect, it } from 'vitest'
import { withDerived } from '../firestore/derived.js'
import { planSheetSync } from '../firestore/sheet-to-db.js'

const rows = [
  { num: '051', hito: '鯉', mono: 'コイン', wh1: '鯉', wh1k: 'こい' },
  { num: '052', hito: '恋人', mono: '', wh1: '恋人', wh1k: 'こいび' },
]

/** DB 側にしか無い情報を持った既存ドキュメント */
const existing = {
  '051': {
    num: '051',
    hito: '鯉',
    mono: 'コイン',
    gainen: '',
    slots: {
      wh1: { word: '鯉', kana: 'こい', imageUrl: 'https://x.test/a.webp' },
      wm1: {
        word: 'コイン',
        kana: 'こいん',
        imageUrl: 'https://x.test/b.webp',
      },
    },
    rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: true },
    ratings: [{ k: 'こい', w: '鯉', v: 2 }],
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'console',
  },
}

const now = '2026-08-20T00:00:00.000Z'
const plan = (over = {}) =>
  planSheetSync({ rows, existing: {}, now, withDerived, ...over })

/** Firestore はマップのフィールドをソートして返す。その往復を再現する */
function asFirestoreReturns(value) {
  if (Array.isArray(value)) return value.map(asFirestoreReturns)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, asFirestoreReturns(value[key])])
    )
  }
  return value
}

describe('sheet to db one-way sync', () => {
  it('REQ-SYN-001: merges each sheet row into slots', () => {
    const result = plan()

    expect(result.writes).toHaveLength(2)
    expect(result.writes[0].doc.slots.wh1).toMatchObject({
      word: '鯉',
      kana: 'こい',
    })
    expect(result.writes[0].doc.source).toBe('sheet')
  })

  it('REQ-SYN-002: keeps rep and ratings that only exist in the DB', () => {
    const changed = [{ ...rows[0], wh1: '恋' }, rows[1]]
    const write = plan({ rows: changed, existing }).writes.find(
      (w) => w.num === '051'
    )

    expect(write.doc.slots.wh1.word).toBe('恋')
    expect(write.doc.rep).toEqual(existing['051'].rep)
    expect(write.doc.ratings).toEqual(existing['051'].ratings)
  })

  it('REQ-SYN-006: is idempotent even after a Firestore round trip', () => {
    // 以前はここが JSON.stringify のキー順依存で毎回 writes が出ていた。
    // Firestore が返す «ソート済み» の形を食わせないと欠陥が隠れる
    const first = plan()
    const stored = Object.fromEntries(
      first.writes.map((w) => [w.num, asFirestoreReturns(w.doc)])
    )
    const second = plan({ existing: stored })

    expect(second.writes).toEqual([])
    expect(second.unchanged).toBe(2)
  })

  it('REQ-SYN-007: refuses to write when the sheet has a duplicate num', () => {
    const dup = [
      { num: '051', wh1: 'A', wh1k: 'こい' },
      { num: '051', wh1: 'B', wh1k: 'こいん' },
    ]
    const result = plan({ rows: dup })

    expect(result.conflicts).toEqual(['051'])
    expect(result.writes.filter((w) => w.num === '051')).toEqual([])
  })

  it('REQ-SYN-008: treats a numeric num as a string instead of crashing', () => {
    const numeric = [{ num: 51, wh1: 'A', wh1k: 'こい' }, rows[1]]

    expect(() => plan({ rows: numeric })).not.toThrow()
    // 51 は 3 桁でないので無視され、052 だけが残る
    expect(plan({ rows: numeric }).writes.map((w) => w.num)).toEqual(['052'])
  })

  it('REQ-SYN-004: ignores rows whose num is not three digits', () => {
    const dirty = [...rows, { num: '' }, { num: '12' }, {}]

    expect(plan({ rows: dirty }).writes.map((w) => w.num)).toEqual([
      '051',
      '052',
    ])
    expect(plan({ rows: dirty }).ignored).toBe(3)
  })

  it('REQ-SYN-003: does not delete numbers missing from the sheet', () => {
    const result = plan({ rows: [rows[1]], existing })

    expect(result.deletes).toEqual([])
    expect(result.kept).toContain('051')
  })

  it('keeps a DB slot that the sheet row no longer mentions', () => {
    // かなを消した行が DB の imageUrl ごと吹き飛ばしていた
    const clearedWm1 = [{ num: '051', hito: '鯉', wh1: '恋', wh1k: 'こい' }]
    const write = plan({ rows: clearedWm1, existing }).writes[0]

    expect(write.doc.slots.wm1).toEqual(existing['051'].slots.wm1)
    expect(write.doc.slots.wh1.imageUrl).toBe('https://x.test/a.webp')
  })

  it('REQ-SYN-009: carries the read-time updatedAt for conflict detection', () => {
    const changed = [{ ...rows[0], wh1: '恋' }, rows[1]]
    const write = plan({ rows: changed, existing }).writes.find(
      (w) => w.num === '051'
    )

    expect(write.expectedUpdatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(plan().writes[0].expectedUpdatedAt).toBe(null)
  })

  it('REQ-SYN-010: recomputes derived for every write', () => {
    const write = plan().writes[0]

    expect(write.doc.derived.rankeyBySlot.wh1).toBe('_AA|')
  })
})
