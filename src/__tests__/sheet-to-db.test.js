import { describe, expect, it } from 'vitest'
import { planSheetSync } from '../firestore/sheet-to-db.js'

const rows = [
  { num: '051', hito: '鯉', mono: 'コイン', wh1: '鯉', wh1k: 'こい' },
  { num: '052', hito: '恋人', mono: '', wh1: '恋人', wh1k: 'こいび' },
]

/** DB 側にしか無い情報を持った既存ドキュメント */
const existing = {
  '051': {
    num: '051',
    slots: {
      wh1: { word: '鯉', kana: 'こい', imageUrl: 'https://x.test/a.webp' },
    },
    rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: true },
    ratings: [{ k: 'こい', w: '鯉', v: 2 }],
    derived: { ptBySlot: { wh1: 2 }, rankeyBySlot: { wh1: '_AA|' } },
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'console',
  },
}

const now = '2026-08-20T00:00:00.000Z'

describe('sheet to db one-way sync', () => {
  it('REQ-SYN-001: merges each sheet row into slots', () => {
    const plan = planSheetSync({ rows, existing: {}, now })

    expect(plan.writes).toHaveLength(2)
    expect(plan.writes[0].doc.slots.wh1).toEqual({
      word: '鯉',
      kana: 'こい',
      imageUrl: '',
    })
    expect(plan.writes[0].doc.source).toBe('sheet')
  })

  it('REQ-SYN-002: keeps rep and ratings that only exist in the DB', () => {
    const changed = [{ ...rows[0], wh1: '恋', wh1k: 'こい' }, rows[1]]
    const plan = planSheetSync({ rows: changed, existing, now })
    const write = plan.writes.find((w) => w.num === '051')

    expect(write.doc.slots.wh1.word).toBe('恋')
    expect(write.doc.rep).toEqual(existing['051'].rep)
    expect(write.doc.ratings).toEqual(existing['051'].ratings)
  })

  it('REQ-SYN-002: never carries a client-supplied derived through', () => {
    const changed = [{ ...rows[0], wh1k: 'こいん' }, rows[1]]
    const plan = planSheetSync({ rows: changed, existing, now })
    const write = plan.writes.find((w) => w.num === '051')

    expect('derived' in write.doc).toBe(false)
  })

  it('REQ-SYN-003: does not delete numbers that are missing from the sheet', () => {
    const plan = planSheetSync({ rows: [rows[1]], existing, now })

    expect(plan.deletes).toEqual([])
    expect(plan.kept).toContain('051')
  })

  it('REQ-SYN-004: ignores rows whose num is not three digits', () => {
    const dirty = [...rows, { num: '', wh1: 'x' }, { num: '12', wh1: 'y' }]
    const plan = planSheetSync({ rows: dirty, existing: {}, now })

    expect(plan.writes.map((w) => w.num)).toEqual(['051', '052'])
    expect(plan.ignored).toBe(2)
  })

  it('REQ-SYN-006: writes nothing when the sheet content is unchanged', () => {
    const first = planSheetSync({ rows, existing: {}, now })
    const applied = Object.fromEntries(first.writes.map((w) => [w.num, w.doc]))
    const second = planSheetSync({ rows, existing: applied, now })

    expect(second.writes).toEqual([])
    expect(second.unchanged).toBe(2)
  })

  it('REQ-SYN-005: reports what changed and what was preserved', () => {
    const plan = planSheetSync({ rows, existing, now })

    expect(plan).toMatchObject({
      unchanged: expect.any(Number),
      ignored: expect.any(Number),
      kept: expect.any(Array),
    })
    expect(plan.writes.length + plan.unchanged).toBe(2)
  })

  it('preserves the image url the DB already holds', () => {
    // シートは画像 URL を持たない列構成なので、DB 側の値を消してはいけない。
    // 語を変えて書き込みが必ず発生する状況で確かめる
    const changed = [{ ...rows[0], wh1: '恋' }, rows[1]]
    const plan = planSheetSync({ rows: changed, existing, now })
    const write = plan.writes.find((w) => w.num === '051')

    expect(write).toBeDefined()
    expect(write.doc.slots.wh1.imageUrl).toBe('https://x.test/a.webp')
  })
})
