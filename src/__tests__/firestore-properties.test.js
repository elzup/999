// 不変条件を総当たりで確かめる (property-based)。
// 手で選んだ fixture は «たまたま通る形» を選んでしまう。実際、冪等性テストは
// 自分の出力を自分に食わせるミラーテストになっていて、キー順依存の欠陥を
// 隠していた。ここでは入力を生成して同じ穴を塞ぐ。

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildAllBundles, mergeBundles } from '../firestore/bundles.js'
import { withDerived } from '../firestore/derived.js'
import { validateNumberDoc } from '../firestore/number-doc.js'
import { planSheetSync } from '../firestore/sheet-to-db.js'

const now = '2026-08-20T00:00:00.000Z'
const kana = fc.constantFrom(
  'こい',
  'こいん',
  'まつ',
  'ろっし',
  'しゅろ',
  'たま'
)
const num3 = fc
  .integer({ min: 0, max: 999 })
  .map((n) => String(n).padStart(3, '0'))

/** シートの 1 行 */
const rowArb = fc.record({
  num: num3,
  hito: fc.string({ maxLength: 4 }),
  mono: fc.string({ maxLength: 4 }),
  wh1: fc.string({ maxLength: 4 }),
  wh1k: kana,
})

/** DB 側にしか無い情報 */
const repArb = fc.record({
  picks: fc.array(fc.record({ k: kana, w: fc.string({ maxLength: 3 }) }), {
    maxLength: 2,
  }),
  confirmed: fc.boolean(),
})
const ratingsArb = fc.uniqueArray(
  fc.record({
    k: kana,
    w: fc.string({ maxLength: 3 }),
    v: fc.constantFrom(-1, 0, 1, 2),
  }),
  { maxLength: 3, selector: (r) => `${r.k}/${r.w}` }
)

/** Firestore はマップのフィールドをソートして返す */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])])
    )
  }
  return value
}

describe('firestore invariants (property-based)', () => {
  it('P1: sheet sync never loses rep or ratings', () => {
    fc.assert(
      fc.property(
        fc.array(rowArb, { minLength: 1, maxLength: 8 }),
        repArb,
        ratingsArb,
        (rows, rep, ratings) => {
          const existing = Object.fromEntries(
            rows.map((r) => [
              r.num,
              {
                num: r.num,
                slots: {},
                rep,
                ratings,
                updatedAt: '2026-01-01T00:00:00.000Z',
                source: 'console',
              },
            ])
          )
          const plan = planSheetSync({ rows, existing, now, withDerived })

          for (const write of plan.writes) {
            expect(write.doc.rep).toEqual(rep)
            expect(write.doc.ratings).toEqual(ratings)
          }
          // 保護違反で拒否された分があってはならない
          expect(plan.refused).toEqual([])
        }
      ),
      { numRuns: 200 }
    )
  })

  it('P2: sync is idempotent under any field order the store returns', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(rowArb, {
          minLength: 1,
          maxLength: 8,
          selector: (r) => r.num,
        }),
        (rows) => {
          const first = planSheetSync({ rows, existing: {}, now, withDerived })
          const stored = Object.fromEntries(
            first.writes.map((w) => [w.num, sortKeys(w.doc)])
          )
          const second = planSheetSync({
            rows,
            existing: stored,
            now,
            withDerived,
          })

          expect(second.writes).toEqual([])
          expect(second.unchanged).toBe(first.writes.length)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('P4: validateNumberDoc returns an error rather than throwing, for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = validateNumberDoc('051', value)
        expect(typeof result).toBe('object')
        expect(result.ok === true || typeof result.error === 'string').toBe(
          true
        )
      }),
      { numRuns: 500 }
    )
  })

  it('P4: it also survives well-shaped documents with junk in the arrays', () => {
    const junk = fc.record({
      num: fc.constant('051'),
      source: fc.constantFrom('sheet', 'app', 'console'),
      slots: fc.constant({}),
      rep: fc.oneof(
        fc.anything(),
        fc.record({ picks: fc.array(fc.anything()) })
      ),
      ratings: fc.array(fc.anything(), { maxLength: 4 }),
    })

    fc.assert(
      fc.property(junk, (doc) => {
        expect(() => validateNumberDoc('051', doc)).not.toThrow()
      }),
      { numRuns: 300 }
    )
  })

  it('P5: bundles partition the numbers with no gap and no duplicate', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(num3, { minLength: 1, maxLength: 40 }),
        (nums) => {
          const docs = nums.map((num) => ({
            num,
            slots: { wh1: { word: 'X', kana: 'こい', imageUrl: '' } },
          }))
          const merged = mergeBundles(buildAllBundles(docs, { now }))

          expect(merged).toHaveLength(nums.length)
          expect(new Set(merged.map((d) => d.num))).toEqual(new Set(nums))
        }
      ),
      { numRuns: 200 }
    )
  })

  it('P3: derived is a pure function of num and slots', () => {
    fc.assert(
      fc.property(num3, kana, (num, k) => {
        const doc = {
          num,
          slots: { wh1: { word: 'X', kana: k, imageUrl: '' } },
        }

        expect(withDerived(doc).derived).toEqual(
          withDerived({ ...doc }).derived
        )
        // 呼び出し元が渡した derived は必ず捨てる
        expect(
          withDerived({ ...doc, derived: { ptBySlot: { wh1: 999 } } }).derived
        ).toEqual(withDerived(doc).derived)
      }),
      { numRuns: 200 }
    )
  })
})
