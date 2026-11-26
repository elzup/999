// DB 作り直しの段 2 (.metarc/db-design-targets.md §5): numbers と配信データのカードから、
// 新しいコレクション symbols / words を «横に» 書く。numbers には触らない (戻すときは 2 つを消すだけ)。
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-symbols.ts --project demo-999           (dry-run)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-symbols.ts --project demo-999 --apply
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-symbols.ts --project demo-999 --verify  (読み戻して往復を見る)
//
// 本番に書くには --prod が要る。付けなければ emulator の demo- project 以外では動かない
// (認証情報があるだけで本番に書けてしまうのを防ぐ)。
//
// この段の symbol は、端末のストアと同じ形 (src/symbols/model.js) をそのまま入れる。
// 代表・評価はまだ «かな + 表記» で語を指している。語の id に置き換えるのは次の段 (人が決める 4 件が要る)。
// 違いは 2 つだけ: 結び付きの配列の名前を DB の設計どおり `words` にする (model.js では links)、
// 語の文書 ID を発番する (w_ + 鍵の hash。表記を直しても ID は変えない。鍵は key 欄に持つ)。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { canonicalJson } from '../src/firestore/number-doc.js'
import { fromDbSymbol, toDbSymbol } from '../src/symbols/db-shape.js'
import {
  fromCard,
  fromNumberDoc,
  mergeWords,
  toCard,
  toNumberDoc,
} from '../src/symbols/model.js'

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    apply: { type: 'boolean', default: false },
    verify: { type: 'boolean', default: false },
    prod: { type: 'boolean', default: false },
  },
})

const NUMBERS = 'numbers'
const SYMBOLS = 'symbols'
const WORDS = 'words'
// Firestore の 1 batch の上限は 500 書き込み
const BATCH_SIZE = 400

type Word = { id: string; category: string; text: string; source: string }
type Sym = { id: string; links: { wordId: string }[]; [key: string]: unknown }

function guard() {
  const project = args.project
  if (!project) throw new Error('--project が要る')
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  if (args.prod) {
    if (emulator)
      throw new Error('--prod なのに FIRESTORE_EMULATOR_HOST がある')
    return project
  }
  if (!emulator || !project.startsWith('demo-')) {
    throw new Error(
      'emulator (FIRESTORE_EMULATOR_HOST) と demo- の project でだけ動く。本番は --prod'
    )
  }
  return project
}

/** 語の文書 ID。鍵 (種別|本体|出典) から 1 回だけ作り、以後は表記が変わっても変えない */
const wordDocId = (key: string) =>
  'w_' + createHash('sha1').update(key).digest('hex').slice(0, 12)

// Firestore は undefined を受け付けない。値の無い欄は落とす (往復の比較も同じ扱い)
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** 比べるときは評価の並びを見ない (並びに意味は無い。find / filter でしか引かない: numberDetail.ts) */
const sortRatings = (doc: Record<string, any>) =>
  Array.isArray(doc.ratings)
    ? {
        ...doc,
        ratings: [...doc.ratings].sort((x, y) =>
          canonicalJson(x).localeCompare(canonicalJson(y))
        ),
      }
    : doc

async function readAll(db: Firestore, name: string) {
  const snap = await db.collection(name).get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
}

function buildFromSource(
  numberDocs: Record<string, any>[],
  cards: Record<string, any>[]
) {
  const converted = [
    ...numberDocs.map((d) => fromNumberDoc(d)),
    ...cards.map((c) => fromCard(c)),
  ] as { symbol: Sym; words: Word[] }[]
  const merged = mergeWords(converted.map((c) => c.words))
  return {
    symbols: converted.map((c) => c.symbol),
    words: merged.words as Record<string, Word>,
    conflicts: merged.conflicts,
  }
}

async function writeAll(
  db: Firestore,
  writes: { col: string; id: string; data: object }[]
) {
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const w of writes.slice(i, i + BATCH_SIZE))
      batch.set(db.collection(w.col).doc(w.id), w.data)
    await batch.commit()
  }
}

/** DB から読み戻した symbols + words を元の形に戻し、元と 1 件ずつ比べる */
async function verify(
  db: Firestore,
  numberDocs: Record<string, any>[],
  cards: Record<string, any>[]
) {
  const words = await readAll(db, WORDS)
  const keyOf = new Map(words.map((w) => [w.id, w.data.key as string]))
  const wordsByKey = Object.fromEntries(
    words.map((w) => [
      w.data.key,
      {
        id: w.data.key,
        category: w.data.category,
        text: w.data.text,
        source: w.data.source,
      },
    ])
  )
  const symbols = new Map(
    (await readAll(db, SYMBOLS)).map((s) => [
      s.id,
      fromDbSymbol(
        s.id,
        s.data,
        (id: string) => keyOf.get(id) ?? id,
        wordsByKey
      ) as Sym,
    ])
  )
  const diffs: { id: string; reason: string }[] = []
  const compare = (id: string, before: object, back: (s: Sym) => object) => {
    const symbol = symbols.get(id)
    if (!symbol) return diffs.push({ id, reason: 'missing' })
    if (
      canonicalJson(sortRatings(clean(before))) !==
      canonicalJson(sortRatings(clean(back(symbol))))
    )
      diffs.push({ id, reason: 'differs' })
  }
  for (const doc of numberDocs) {
    const { symbol } = fromNumberDoc(doc) as { symbol: Sym }
    compare(symbol.id, doc, (s) => toNumberDoc(s, wordsByKey))
  }
  for (const card of cards) {
    const { symbol } = fromCard(card) as { symbol: Sym }
    compare(symbol.id, card, (s) => toCard(s, wordsByKey))
  }
  return { symbols: symbols.size, words: words.length, diffs }
}

async function main() {
  const projectId = guard()
  const db = getFirestore(initializeApp({ projectId }))
  db.settings({ ignoreUndefinedProperties: true })

  const numberDocs = (await readAll(db, NUMBERS))
    .map((d) => d.data)
    .filter((d) => /^\d{3,4}$/.test(String(d.num ?? '')))
  const cards = JSON.parse(readFileSync('private/data.json', 'utf8'))
    .cards as Record<string, any>[]

  if (args.verify) {
    console.log(
      JSON.stringify(
        { projectId, ...(await verify(db, numberDocs, cards)) },
        null,
        1
      )
    )
    return
  }

  const { symbols, words, conflicts } = buildFromSource(numberDocs, cards)
  if (conflicts.length)
    throw new Error(`語の id の食い違い ${conflicts.length} 件。書かない`)
  const now = new Date().toISOString()
  const converted = symbols.map((symbol) => {
    const { doc, stats } = toDbSymbol(symbol, words, wordDocId)
    return { id: symbol.id, doc: clean(doc), stats }
  })
  const refStats = converted.reduce<Record<string, number>>(
    (sum, c) =>
      Object.fromEntries(
        Object.entries(c.stats).map(([k, v]) => [
          k,
          (sum[k] ?? 0) + (v as number),
        ])
      ),
    {}
  )
  const loose = converted.flatMap((c) =>
    c.stats.loosePicks || c.stats.looseRatings
      ? [
          {
            id: c.id,
            picks: c.doc.rep?.picks?.filter((p: any) => !p.wordId),
            looseRatings: c.doc.looseRatings,
          },
        ]
      : []
  )
  const writes = [
    ...Object.values(words).map((w) => ({
      col: WORDS,
      id: wordDocId(w.id),
      data: {
        category: w.category,
        text: w.text,
        source: w.source,
        key: w.id,
        updatedAt: now,
      },
    })),
    ...converted.map((c) => ({
      col: SYMBOLS,
      id: c.id,
      data: { ...c.doc, migratedAt: now },
    })),
  ]
  const ids = new Set(writes.map((w) => `${w.col}/${w.id}`))
  if (ids.size !== writes.length)
    throw new Error('文書 ID が重なった。書かない')

  console.log(
    JSON.stringify(
      {
        projectId,
        apply: args.apply,
        source: { numbers: numberDocs.length, cards: cards.length },
        writes: { symbols: symbols.length, words: Object.keys(words).length },
        refs: refStats,
        loose,
      },
      null,
      1
    )
  )
  if (args.apply) await writeAll(db, writes)
}

await main()
