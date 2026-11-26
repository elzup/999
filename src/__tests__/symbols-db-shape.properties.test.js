// DB 移行 (numbers → symbols / words) の不変条件を総当たりで確かめる (property-based)。
// 実データの往復 (.metarc/check-symbols-roundtrip.ts) は «今あるデータ» でしか確かめられない。
// ここでは番号の文書を生成し、これから入る形 (出典 2 つ・タグの並び・枠の外の語・かな無し) でも
// 移行が値を落とさないことを見る。

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fromDbSymbol, toDbSymbol } from '../symbols/db-shape.js'
import { mirrorWrites, SYMBOLS, WORDS, wordDocId } from '../symbols/mirror.js'
import { byId, fromNumberDoc } from '../symbols/model.js'

// 少ない字種で作る: 同じ語・同じ表記がぶつかる場合を多く出すため
const textArb = fc.constantFrom('火', 'まい', '南', '三田', 'ミタ')
const tagArb = fc.constantFrom('a', 'b', 'g', 'i')
const labelArb = fc.constantFrom('n', 's')
const kanaArb = fc.constantFrom('', 'まい', 'ひ', 'みなみ')

/** 表記 1 つ。人の側は «語#タグ -ラベル»、物の側は «語 -ラベル#タグ» */
const notationArb = (category) =>
  fc
    .record({
      text: textArb,
      tags: fc.array(tagArb, { maxLength: 3 }),
      labels: fc.array(labelArb, { maxLength: 1 }),
    })
    .map(({ text, tags, labels }) => {
      const tagPart = tags.map((t) => `#${t}`).join('')
      const labelPart = labels.map((l) => ` -${l}`).join('')
      return category === 'mono'
        ? `${text}${labelPart}${tagPart}`
        : `${text}${tagPart}${labelPart}`
    })

/** 人/物の一覧。空の項目 (位置だけ) も混ぜる。4 項目目以降は枠の外 (かなが無い) */
const listArb = (category) =>
  fc.array(fc.oneof(notationArb(category), fc.constant('')), { maxLength: 5 })

/** 一覧の 1〜3 番目に枠を付ける。枠が空のこともある */
const slotsOf = (items, prefix, kanas, filled) =>
  Object.fromEntries(
    items.slice(0, 3).flatMap((word, i) =>
      word || kanas[i]
        ? [[`${prefix}${i + 1}`, { word: filled[i] ? word : '', kana: kanas[i] }]]
        : []
    )
  )

/** 代表・評価が指す «かな + 表記»。一覧の項目を指すことが多く、ときどき存在しない語や k 無しを指す */
const refArb = (items) =>
  fc.record(
    {
      k: kanaArb,
      w: items.length
        ? fc.oneof(fc.constantFrom(...items), fc.constant('無い語'))
        : fc.constant('無い語'),
    },
    { requiredKeys: ['w'] }
  )

const numberDocArb = fc
  .record({
    num: fc.integer({ min: 0, max: 999 }).map((n) => String(n).padStart(3, '0')),
    hito: listArb('hito'),
    mono: listArb('mono'),
    kanas: fc.array(kanaArb, { minLength: 6, maxLength: 6 }),
    filled: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    hasRep: fc.boolean(),
    hasRatings: fc.boolean(),
    extra: fc.option(fc.constant({ stale: true }), { nil: undefined }),
  })
  .chain((base) => {
    const items = [...base.hito, ...base.mono].filter(Boolean)
    return fc
      .record({
        picks: fc.array(refArb(items), { maxLength: 3 }),
        confirmed: fc.boolean(),
        ratings: fc.array(
          fc
            .tuple(refArb(items), fc.constantFrom(-1, 0, 1, 2))
            .map(([ref, v]) => ({ ...ref, v, ...(base.extra ?? {}) })),
          { maxLength: 3 }
        ),
      })
      .map(({ picks, confirmed, ratings }) => ({
        num: base.num,
        hito: base.hito.join(','),
        mono: base.mono.join(','),
        gainen: '',
        slots: {
          ...slotsOf(base.hito, 'wh', base.kanas.slice(0, 3), base.filled),
          ...slotsOf(base.mono, 'wm', base.kanas.slice(3), base.filled.slice(3)),
        },
        ...(base.hasRep ? { rep: { picks, confirmed } } : {}),
        ...(base.hasRatings ? { ratings } : {}),
        updatedAt: 't0',
      }))
  })

// 鍵がそのまま読めるように、テストでは文書 ID = 'w_' + 鍵 (本番は hash。単射性は P5 で別に見る)
const docIdOf = (key) => `w_${key}`
const keyOf = (id) => id.slice(2)

function migrate(doc) {
  const { symbol, words } = fromNumberDoc(doc)
  const wordsById = byId(words)
  const { doc: db, stats } = toDbSymbol(symbol, wordsById, docIdOf)
  return { symbol, words, wordsById, db, stats }
}

/** 評価は語の側に移すので並びは変わる。中身の多重集合で比べる */
// undefined の欄は Firestore に書くと消える (mirror.js の clean) ので、無い欄と同じに扱う
const ratingKey = (r) =>
  JSON.stringify(Object.entries(r).filter(([, v]) => v !== undefined).sort())
const sortedRatings = (ratings) =>
  ratings === undefined ? undefined : [...ratings].map(ratingKey).sort()

const RUNS = { numRuns: 1000 }

describe('DB 移行の不変条件 (property-based)', () => {
  it('P1: symbols の形から端末の symbol に戻すと、元と同じ (評価の並びは問わない)', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { symbol, wordsById, db } = migrate(doc)
        const back = fromDbSymbol(symbol.id, db, keyOf, wordsById)
        expect({ ...back, ratings: undefined }).toEqual({
          ...symbol,
          ratings: undefined,
        })
        expect(sortedRatings(back.ratings)).toEqual(
          sortedRatings(symbol.ratings)
        )
      }),
      RUNS
    )
  })

  it('P2: 結び付きの tags は属性タグ (g / i) だけ。出典は語の source にある', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { db } = migrate(doc)
        db.words.forEach((link) => {
          link.tags.forEach((t) => expect(['g', 'i']).toContain(t))
        })
      }),
      RUNS
    )
  })

  it('P3: 代表と wordIds が指す語は、その記号の結び付きに必ずある', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { db, wordsById } = migrate(doc)
        const linked = new Set(db.words.map((l) => l.wordId))
        expect(new Set(db.wordIds)).toEqual(linked)
        expect(db.wordIds).toHaveLength(linked.size)
        db.wordIds.forEach((id) => expect(wordsById[keyOf(id)]).toBeDefined())
        ;(db.rep?.picks ?? [])
          .filter((p) => p.wordId)
          .forEach((p) => expect(linked).toContain(p.wordId))
      }),
      RUNS
    )
  })

  it('P4: 代表・評価は語の ID か文字列のどちらかに必ず残り、数が変わらない', () => {
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const { db, stats } = migrate(doc)
        expect(db.rep?.picks?.length ?? 0).toBe(doc.rep?.picks.length ?? 0)
        const rated = db.words.filter((l) => l.rating !== undefined).length
        expect(rated + (db.looseRatings?.length ?? 0)).toBe(
          doc.ratings?.length ?? 0
        )
        expect(stats.ratings).toBe(doc.ratings?.length ?? 0)
        expect(stats.looseRatings).toBe(db.looseRatings?.length ?? 0)
      }),
      RUNS
    )
  })

  it('P5: 語の文書 ID は鍵から決まり、違う鍵がぶつからない', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ maxLength: 12 }), {
          minLength: 2,
          maxLength: 50,
        }),
        (keys) => {
          const ids = keys.map(wordDocId)
          expect(new Set(ids).size).toBe(keys.length)
          expect(keys.map(wordDocId)).toEqual(ids)
          ids.forEach((id) => expect(id).toMatch(/^w_[0-9a-f]{12}$/))
        }
      ),
      RUNS
    )
  })

  it('P6: 写しの書き込みは、記号が指す語を必ず words にも書く。undefined を含まない', () => {
    const hasUndefined = (value) =>
      value === undefined ||
      (value !== null &&
        typeof value === 'object' &&
        Object.values(value).some(hasUndefined))
    fc.assert(
      fc.property(numberDocArb, (doc) => {
        const writes = mirrorWrites(doc, 'now')
        const symbolWrites = writes.filter((w) => w.col === SYMBOLS)
        expect(symbolWrites).toHaveLength(1)
        const written = new Set(
          writes.filter((w) => w.col === WORDS).map((w) => w.id)
        )
        const data = symbolWrites[0].data
        data.wordIds.forEach((id) => expect(written).toContain(id))
        ;(data.rep?.picks ?? [])
          .filter((p) => p.wordId)
          .forEach((p) => expect(written).toContain(p.wordId))
        writes.forEach((w) => expect(hasUndefined(w.data)).toBe(false))
      }),
      RUNS
    )
  })
})
