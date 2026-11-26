// db4 (v4 の変換) の性質。spec: .metarc/db-design-v4.md
// 2026-11-26 の事故 (一覧の 1〜3 番目が古いと語が落ちた) を、性質として固定する。
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fromLegacy } from '../db4/from-legacy.js'
import { checkIntegrity } from '../db4/integrity.js'
import { toNumberDoc } from '../db4/to-legacy.js'
import { canonicalJson } from '../firestore/number-doc.js'
import { sheetFormOfDoc } from '../firestore/sheet-bisync.js'

// 少ない字種: 同じ綴り・人と物の同綴り・出典 2 つ をよく出す
const textArb = fc.constantFrom('火', 'まい', '南', '三田', 'ミタ')
const sourceArb = fc.constantFrom('a', 'b')
// 属性と語のラベルは語の性質 (D-0177)。同じ語ならどこでも同じなので、本体の綴りで決める
const ATTRS_OF = { 火: ['g'], 南: ['i'], 三田: ['g', 'i'] }
const WORD_LABELS_OF = { まい: ['j'] }
const kanaArb = fc.constantFrom('', 'まい', 'ひ', 'みなみ')

const notationArb = (role) =>
  fc
    .record({
      text: textArb,
      sources: fc.uniqueArray(sourceArb, { maxLength: 2 }),
      isForced: fc.boolean(),
    })
    .map(({ text, sources, isForced }) => ({
      text,
      tags: [...sources, ...(ATTRS_OF[text] ?? [])],
      labels: [...(WORD_LABELS_OF[text] ?? []), ...(isForced ? ['x'] : [])],
    }))
    .map(({ text, tags, labels }) => {
      const tagPart = tags.map((t) => `#${t}`).join('')
      const labelPart = labels.map((l) => ` -${l}`).join('')
      return role === 'mono'
        ? `${text}${labelPart}${tagPart}`
        : `${text}${tagPart}${labelPart}`
    })

const sideArb = (role) =>
  fc.record({
    slots: fc.array(
      fc.record(
        {
          word: notationArb(role),
          kana: kanaArb,
          imageUrl: fc.constantFrom('', 'u1'),
          // 画像を確定すると付く欄 (console-writes の confirmImage)
          confirmedFor: textArb,
          tagImages: fc.constant({ a: 'u2' }),
        },
        { requiredKeys: ['word', 'kana', 'imageUrl'] }
      ),
      { maxLength: 3 }
    ),
    // 一覧の 1〜3 番目は枠と食い違ってよい (アプリは枠だけを書く)
    stale: fc.array(fc.oneof(notationArb(role), fc.constant('')), {
      minLength: 3,
      maxLength: 3,
    }),
    beyond: fc.array(fc.oneof(notationArb(role), fc.constant('')), {
      maxLength: 3,
    }),
  })

const numberDocArb = fc
  .record({
    num: fc
      .integer({ min: 0, max: 999 })
      .map((n) => String(n).padStart(3, '0')),
    hito: sideArb('hito'),
    mono: sideArb('mono'),
    refs: fc.array(
      fc.record({
        k: kanaArb,
        side: fc.constantFrom('hito', 'mono'),
        at: fc.nat(5),
        v: fc.nat(3),
      }),
      { maxLength: 3 }
    ),
  })
  .map(({ num, hito, mono, refs }) => {
    const sides = { hito, mono }
    const listOf = (s) => [
      ...s.slots.map((x) => x.word),
      ...s.stale.slice(s.slots.length),
      ...s.beyond,
    ]
    const slots = Object.fromEntries(
      ['hito', 'mono'].flatMap((role) =>
        sides[role].slots.map((s, i) => [
          `${role === 'hito' ? 'wh' : 'wm'}${i + 1}`,
          s,
        ])
      )
    )
    const doc = {
      num,
      hito: [
        ...hito.stale.map((w, i) => (hito.slots[i] ? w : w)),
        ...hito.beyond,
      ].join(','),
      mono: [...mono.stale, ...mono.beyond].join(','),
      slots,
      updatedAt: 't0',
      source: 'console',
    }
    const pickOf = (r) => {
      const list = listOf(sides[r.side])
      return { k: r.k, w: list[r.at % Math.max(1, list.length)] || '無い語' }
    }
    return {
      ...doc,
      rep: { picks: refs.map(pickOf), confirmed: false },
      ratings: refs.map((r) => ({ ...pickOf(r), v: r.v })),
    }
  })

const RUNS = { numRuns: 1000 }
const sortRatings = (list) => list && list.map((r) => canonicalJson(r)).sort()

describe('db4: 番号の文書 → v4 → 番号の文書', () => {
  it('往復で値が変わらない (一覧の 1〜3 番目は枠から、4 番目以降は一覧から)', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { symbols, words } = fromLegacy({ numbers: [doc] })
        const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
        const back = toNumberDoc(symbols[0], wordsById)
        const form = sheetFormOfDoc(doc)
        expect(back.hito).toBe(form.hito)
        expect(back.mono).toBe(form.mono)
        expect(canonicalJson(back.slots)).toBe(canonicalJson(doc.slots))
        expect(canonicalJson(back.rep)).toBe(canonicalJson(doc.rep))
        expect(sortRatings(back.ratings)).toEqual(sortRatings(doc.ratings))
      }),
      RUNS
    )
  })

  it('枠にだけある語も落ちない (事故の再現)', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { symbols, words } = fromLegacy({ numbers: [doc] })
        const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
        const back = toNumberDoc(symbols[0], wordsById)
        for (const [key, slot] of Object.entries(doc.slots)) {
          expect(back.slots[key]?.word).toBe(slot.word)
        }
      }),
      RUNS
    )
  })

  it('整合検査の違反が 0', () => {
    fc.assert(
      fc.property(fc.array(numberDocArb, { maxLength: 4 }), (docs) => {
        const unique = [...new Map(docs.map((d) => [d.num, d])).values()]
        // 入力が同じ語を 2 つの番号に置くのは登録のミス (C9) で、変換の誤りではない
        const { errors } = checkIntegrity(fromLegacy({ numbers: unique }))
        expect(errors.filter((e) => e.rule !== 'C9')).toEqual([])
      }),
      RUNS
    )
  })

  it('同じ入力からは同じ語の ID (移行をやり直しても変わらない)', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const a = fromLegacy({ numbers: [doc] })
        const b = fromLegacy({ numbers: [structuredClone(doc)] })
        expect(a.words.map((w) => w.id)).toEqual(b.words.map((w) => w.id))
      }),
      RUNS
    )
  })
})
