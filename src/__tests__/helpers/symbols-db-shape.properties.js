// DB 移行 (numbers → symbols / words) の不変条件。入力の作り方と性質を 1 か所に置く。
// テスト (symbols-db-shape.properties.test.js) と、可視化 (scripts/report-db-migration-properties.ts) が
// 同じ性質を使う。可視化は直す前の db-shape.js にも当てるので、変換関数は引数で受け取る。

import assert from 'node:assert/strict'
import fc from 'fast-check'
import { mirrorWrites, SYMBOLS, WORDS, wordDocId } from '../../symbols/mirror.js'
import { byId, fromNumberDoc } from '../../symbols/model.js'

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

export const numberDocArb = fc
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

// 鍵がそのまま読めるように、ここでは文書 ID = 'w_' + 鍵 (本番は hash。単射性は P5 で別に見る)
export const docIdOf = (key) => `w_${key}`
export const keyOf = (id) => id.slice(2)

/** 番号の文書 → 端末の symbol → DB の形 → 端末の symbol */
export function migrate(shape, doc) {
  const { symbol, words } = fromNumberDoc(doc)
  const wordsById = byId(words)
  const { doc: db, stats } = shape.toDbSymbol(symbol, wordsById, docIdOf)
  const back = shape.fromDbSymbol(symbol.id, db, keyOf, wordsById)
  return { symbol, words, wordsById, db, stats, back }
}

// undefined の欄は Firestore に書くと消える (mirror.js の clean) ので、無い欄と同じに扱う
export const plain = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value))

/** 評価は語の側に移すので並びは変わる。中身の多重集合で比べる */
export const sortedRatings = (ratings) =>
  ratings === undefined
    ? undefined
    : ratings.map((r) => JSON.stringify(Object.entries(plain(r)).sort())).sort()

const hasUndefined = (value) =>
  value === undefined ||
  (value !== null &&
    typeof value === 'object' &&
    Object.values(value).some(hasUndefined))

/**
 * 性質の一覧。check は破れたら throw する。
 * guards = 何を守っているか、code = 守っている側のコード (可視化で出す)
 */
export const dbShapeProperties = (shape) => [
  {
    id: 'P1',
    title: '往復しても値が変わらない',
    guards: 'symbols の形から端末の symbol に戻すと元と同じ (評価の並びは問わない)',
    code: 'src/symbols/db-shape.js toDbSymbol / fromDbSymbol / exactLink',
    arb: numberDocArb,
    check: (doc) => {
      const { symbol, back } = migrate(shape, doc)
      assert.deepEqual(
        plain({ ...back, ratings: undefined }),
        plain({ ...symbol, ratings: undefined })
      )
      assert.deepEqual(sortedRatings(back.ratings), sortedRatings(symbol.ratings))
    },
  },
  {
    id: 'P2',
    title: 'tags は属性タグだけ',
    guards: '結び付きの tags は g / i だけ。出典は語の source にある (D-0154)',
    code: 'src/symbols/db-shape.js toDbTags',
    arb: numberDocArb,
    check: (doc) => {
      const { db } = migrate(shape, doc)
      db.words.forEach((link) =>
        link.tags.forEach((t) => assert.ok(['g', 'i'].includes(t), `tag ${t}`))
      )
    },
  },
  {
    id: 'P3',
    title: '指す語が必ずある',
    guards: '代表と wordIds が指す語は、その記号の結び付きに必ずある',
    code: 'src/symbols/db-shape.js toDbSymbol (wordIds / picks)',
    arb: numberDocArb,
    check: (doc) => {
      const { db, wordsById } = migrate(shape, doc)
      const linked = new Set(db.words.map((l) => l.wordId))
      assert.deepEqual(new Set(db.wordIds), linked)
      assert.equal(db.wordIds.length, linked.size)
      db.wordIds.forEach((id) => assert.ok(wordsById[keyOf(id)], id))
      ;(db.rep?.picks ?? [])
        .filter((p) => p.wordId)
        .forEach((p) => assert.ok(linked.has(p.wordId), p.wordId))
    },
  },
  {
    id: 'P4',
    title: '代表・評価の数が保たれる',
    guards: '代表・評価は語の ID か文字列のどちらかに必ず残り、数が変わらない',
    code: 'src/symbols/db-shape.js toDbSymbol (picks / looseRatings)',
    arb: numberDocArb,
    check: (doc) => {
      const { db, stats } = migrate(shape, doc)
      assert.equal(db.rep?.picks?.length ?? 0, doc.rep?.picks.length ?? 0)
      const rated = db.words.filter((l) => l.rating !== undefined).length
      assert.equal(rated + (db.looseRatings?.length ?? 0), doc.ratings?.length ?? 0)
      assert.equal(stats.ratings, doc.ratings?.length ?? 0)
      assert.equal(stats.looseRatings, db.looseRatings?.length ?? 0)
    },
  },
  {
    id: 'P5',
    title: '語の文書 ID がぶつからない',
    guards: '語の文書 ID は鍵から決まり、違う鍵がぶつからない',
    code: 'src/symbols/mirror.js wordDocId',
    arb: fc.uniqueArray(fc.string({ maxLength: 12 }), { minLength: 2, maxLength: 50 }),
    check: (keys) => {
      const ids = keys.map(wordDocId)
      assert.equal(new Set(ids).size, keys.length)
      assert.deepEqual(keys.map(wordDocId), ids)
      ids.forEach((id) => assert.match(id, /^w_[0-9a-f]{12}$/))
    },
  },
  {
    id: 'P6',
    title: '写しが指す語を必ず書く',
    guards: '写しの書き込みは、記号が指す語を必ず words にも書く。undefined を含まない',
    code: 'src/symbols/mirror.js mirrorWrites (今の db-shape を使う)',
    arb: numberDocArb,
    check: (doc) => {
      const writes = mirrorWrites(doc, 'now')
      const symbolWrites = writes.filter((w) => w.col === SYMBOLS)
      assert.equal(symbolWrites.length, 1)
      const written = new Set(writes.filter((w) => w.col === WORDS).map((w) => w.id))
      const data = symbolWrites[0].data
      data.wordIds.forEach((id) => assert.ok(written.has(id), id))
      ;(data.rep?.picks ?? [])
        .filter((p) => p.wordId)
        .forEach((p) => assert.ok(written.has(p.wordId), p.wordId))
      writes.forEach((w) => assert.equal(hasUndefined(w.data), false))
    },
  },
]
