// 新しい形 (symbols / words) を旧 DB (numbers) から作る・直す (DB 計画 P5)。
//
//   node scripts/db4-build.ts --target emulator|prod [--build | --repair] [--apply]
//
//   --build   いまの symbols / words をバックアップしてから全部消し、numbers + cards.tsv + ff.json から作り直す
//             語の ID は移行用の種から作る (D-0164)。P5 で 1 回だけ使う。それ以降に使うと発番済みの ID が変わる
//   --repair  旧と新が食い違う番号 (C7 差分) だけ、番号の文書を変えずに保存し直す。保存の口 (writeNumber) が
//             同じ transaction で新しい形を作り直すので、語の ID は引き継がれる。書き込みを止めていた間の取り残しを直す
//   --apply   書く。付けなければ読んで数えるだけ
//
// 本番: export FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<個人>) と DB4_WRITE=on が要る。
// 本番に書くのは人の同意を取ってから (計画の 🔒)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parseCardsTsv } from '../src/cards-tsv.js'
import { fromLegacy } from '../src/db4/from-legacy.js'
import { driftedNums } from '../src/db4/check-all.js'
import { checkIntegrity } from '../src/db4/integrity.js'
import { shapeErrors } from '../src/db4/schema.js'
import { SYMBOLS, WORDS } from '../src/db4/write-layer.js'
import { connectRest, fromFields, toFields } from '../src/firestore/rest.js'
import { writeNumber } from '../src/firestore/write.js'

const { values: args } = parseArgs({
  options: {
    target: { type: 'string' },
    build: { type: 'boolean', default: false },
    repair: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
})
const TARGETS = {
  emulator: {
    host: 'http://127.0.0.1:8080',
    project: 'demo-999',
    token: 'owner',
  },
  prod: {
    host: 'https://firestore.googleapis.com',
    project: 'anoz-memosupo',
    token: process.env.FIRESTORE_ACCESS_TOKEN,
  },
} as const
const target = TARGETS[args.target as keyof typeof TARGETS]
if (!target) throw new Error('--target emulator か --target prod を付ける')
if (args.build === args.repair)
  throw new Error('--build か --repair のどちらか 1 つ')
if (!target.token) throw new Error('FIRESTORE_ACCESS_TOKEN が無い')
if (args.apply && args.repair && process.env.DB4_WRITE !== 'on')
  throw new Error('--repair --apply は DB4_WRITE=on で動かす')

const root = `projects/${target.project}/databases/(default)/documents`
const base = `${target.host}/v1/${root}`
const BATCH = 400
const fetchImpl = (url: string, init: any) =>
  fetch(url.replace('https://firestore.googleapis.com', target.host), init)

async function call(
  path: string,
  init: { method?: string; body?: unknown } = {}
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${target.token}`,
      'content-type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json()
  if (!res.ok)
    throw new Error(`${res.status} ${json?.error?.message ?? 'unknown'}`)
  return json
}

async function listAll(col: string) {
  const docs: any[] = []
  let pageToken = ''
  do {
    const page = await call(
      `/${col}?pageSize=300${
        pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      }`
    )
    for (const d of page.documents ?? []) {
      docs.push({
        id: decodeURIComponent(d.name.split('/').at(-1)),
        ...fromFields(d.fields ?? {}),
      })
    }
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return docs
}

async function commitAll(writes: any[]) {
  for (let i = 0; i < writes.length; i += BATCH) {
    await call(':commit', {
      method: 'POST',
      body: { writes: writes.slice(i, i + BATCH) },
    })
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const [numbers, oldSymbols, oldWords] = await Promise.all([
  listAll('numbers'),
  listAll(SYMBOLS),
  listAll(WORDS),
])
console.log(
  `${args.target}: numbers ${numbers.length} / いまの symbols ${oldSymbols.length} / words ${oldWords.length}`
)

if (args.build) {
  const cards = parseCardsTsv(readFileSync('src/data/cards.tsv', 'utf8'))
  const ff = JSON.parse(readFileSync('private/ff.json', 'utf8'))
  const built = fromLegacy({
    numbers: numbers.map(({ id: _id, ...d }) => d),
    cards,
    ff,
  })
  const { errors } = checkIntegrity(built)
  const shape = shapeErrors(built)
  const drift = driftedNums(numbers, built.symbols, built.words)
  console.log(
    `作る: symbols ${built.symbols.length} / words ${built.words.length} / 違反 ${errors.length} / 形 ${shape.length} / C7 差分 ${drift.length}`
  )
  for (const e of errors.slice(0, 10))
    console.log('   ', e.rule, e.symbol ?? e.word, e.detail)
  if (errors.length || shape.length || drift.length)
    throw new Error('違反があるので作らない')
  if (args.apply) {
    const dir = `.metarc/backup/${stamp}-db4-before-build`
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/numbers.json`, JSON.stringify(numbers))
    writeFileSync(`${dir}/symbols.json`, JSON.stringify(oldSymbols))
    writeFileSync(`${dir}/words.json`, JSON.stringify(oldWords))
    console.log(`バックアップ: ${dir}`)
    const name = (col: string, id: string) => `${root}/${col}/${id}`
    const clean = (v: unknown) => JSON.parse(JSON.stringify(v))
    await commitAll([
      ...oldSymbols.map((s) => ({ delete: name(SYMBOLS, s.id) })),
      ...oldWords.map((w) => ({ delete: name(WORDS, w.id) })),
    ])
    await commitAll([
      ...built.symbols.map(({ id, ...s }) => ({
        update: { name: name(SYMBOLS, id), fields: toFields(clean(s)) },
      })),
      ...built.words.map(({ id, ...w }) => ({
        update: { name: name(WORDS, id), fields: toFields(clean(w)) },
      })),
    ])
    const [s2, w2] = await Promise.all([listAll(SYMBOLS), listAll(WORDS)])
    const after = checkIntegrity({ symbols: s2, words: w2 })
    console.log(
      `書いた後: symbols ${s2.length} / words ${w2.length} / 違反 ${
        after.errors.length
      } / C7 差分 ${driftedNums(numbers, s2, w2).length}`
    )
  }
}

if (args.repair) {
  const drift = driftedNums(numbers, oldSymbols, oldWords)
  console.log(
    `旧と新が食い違う番号: ${drift.length}${
      drift.length ? ` (${drift.slice(0, 20).join(' ')})` : ''
    }`
  )
  if (args.apply && drift.length) {
    // emulator は transaction 付きの REST の読みに応えない (2026-11-27 確認) ので Admin SDK で繋ぐ
    const db =
      args.target === 'emulator'
        ? (await import('../src/firestore/db.js')).connect({
            projectId: target.project,
            source: 'numbers',
          })
        : connectRest({
            projectId: target.project,
            token: target.token,
            fetchImpl,
          })
    const byNum = new Map(numbers.map((d) => [d.num, d]))
    for (const num of drift) {
      // derived はサーバーが付け直す欄なので渡さない (writeNumber が拒む)
      const { id: _id, derived: _derived, ...doc } = byNum.get(num)
      const r = await writeNumber(db, {
        num,
        doc,
        expectedUpdatedAt: doc.updatedAt ?? null,
      })
      console.log(`   ${num}: ${r.ok ? '直した' : JSON.stringify(r)}`)
    }
  }
}
