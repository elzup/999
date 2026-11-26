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
import { linkImagesFromSlots, wordImagePlan } from '../src/db4/word-image.js'
import { checkIntegrity } from '../src/db4/integrity.js'
import { shapeErrors } from '../src/db4/schema.js'
import {
  commitSymbolWrite,
  prepareSymbolWrite,
  SYMBOLS,
  WORDS,
} from '../src/db4/write-layer.js'
import { toCard } from '../src/db4/to-legacy.js'
import { canonicalJson } from '../src/firestore/number-doc.js'
import { connectRest, fromFields, toFields } from '../src/firestore/rest.js'
import { writeNumber } from '../src/firestore/write.js'

const { values: args } = parseArgs({
  options: {
    target: { type: 'string' },
    build: { type: 'boolean', default: false },
    repair: { type: 'boolean', default: false },
    'word-images': { type: 'boolean', default: false },
    cards: { type: 'boolean', default: false },
    'rename-roles': { type: 'boolean', default: false },
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
if (
  [
    args.build,
    args.repair,
    args['word-images'],
    args.cards,
    args['rename-roles'],
  ].filter(Boolean).length !== 1
)
  throw new Error('--build / --repair / --word-images / --cards のどれか 1 つ')
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
        // 文書のキーを後に置く (imageSlots は中身にも id 欄を持つ)
        ...fromFields(d.fields ?? {}),
        id: decodeURIComponent(d.name.split('/').at(-1)),
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

// --word-images: 記号ごとの画像から語の画像を決めて語に書く (P8)。食い違う語は保留し、一覧を .metarc に書く
if (args['word-images']) {
  const imageSlots = await listAll('imageSlots')
  const linkImages = linkImagesFromSlots(imageSlots, oldSymbols, oldWords)
  console.log(
    `imageSlots ${imageSlots.length} / 画像のある枠 ${
      imageSlots.filter((d) => d.image?.url).length
    } / 語に当たった ${linkImages.length}`
  )
  const plan = wordImagePlan({
    symbols: oldSymbols,
    words: oldWords,
    linkImages,
  })
  const textOf = new Map(
    oldWords.map((w) => [w.id, `${w.text}${w.source ? '#' + w.source : ''}`])
  )
  console.log(
    `語に載せる画像 ${plan.set.length} / 食い違って保留 ${plan.conflicts.length}`
  )
  const report = plan.conflicts
    .map(
      (c) =>
        `- ${textOf.get(c.wordId)} (${c.wordId})\n${c.images
          .map((u) => `  - ${u}`)
          .join('\n')}`
    )
    .join('\n')
  writeFileSync(
    '.metarc/db4-image-conflicts.md',
    `# 画像が食い違う語 (${plan.conflicts.length})\n\n語に載せる画像を 1 つ選ぶ。記号ごとの画像はそのまま残る\n\n${report}\n`
  )
  if (args.apply && plan.set.length) {
    await commitAll(
      plan.set.map((s) => ({
        update: {
          name: `${root}/${WORDS}/${s.wordId}`,
          fields: toFields({ imageUrl: s.imageUrl }),
        },
        updateMask: { fieldPaths: ['imageUrl'] },
      }))
    )
    const after = await listAll(WORDS)
    console.log(
      `書いた後: 画像のある語 ${
        after.filter((w) => w.imageUrl).length
      } / 違反 ${
        checkIntegrity({ symbols: oldSymbols, words: after }).errors.length
      }`
    )
  }
}

// --cards: シートから取った src/data/cards.tsv を DB のカードの記号へ書く (カードの正本は DB)。
// 番号と同じ保存の口 (語の ID の引き継ぎ・形と整合の検査) を 1 枚ずつ transaction で通す
if (args.cards) {
  const cards = parseCardsTsv(readFileSync('src/data/cards.tsv', 'utf8'))
  const differs = (list: any[], words: any[]) => {
    const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
    const byId = new Map(list.map((s) => [s.id, s]))
    return cards.filter((card) => {
      const symbol = byId.get(`card:${card.suit}${card.rank}`)
      return (
        !symbol ||
        canonicalJson(toCard(symbol, wordsById)) !== canonicalJson(card)
      )
    })
  }
  const changed = differs(oldSymbols, oldWords)
  console.log(
    `cards.tsv ${cards.length} 枚 / DB と違う ${changed.length} 枚${
      changed.length
        ? ' (' + changed.map((c) => c.suit + c.rank).join(' ') + ')'
        : ''
    }`
  )
  if (args.apply && changed.length) {
    const rest = connectRest({
      projectId: target.project,
      token: target.token,
      fetchImpl,
    })
    for (const card of changed) {
      await rest.runDb4Transaction(async (io: any) => {
        const plan = await prepareSymbolWrite(
          io,
          `card:${card.suit}${card.rank}`
        )
        commitSymbolWrite(io, plan, { cards: [card] })
      })
    }
    const [s2, w2] = await Promise.all([listAll(SYMBOLS), listAll(WORDS)])
    console.log(
      `書いた後: DB と違う ${differs(s2, w2).length} 枚 / 違反 ${
        checkIntegrity({ symbols: s2, words: w2 }).errors.length
      }`
    )
  }
}

// --rename-roles: role のコードを person / thing / action に (D-0175)。1 回だけ使う
if (args['rename-roles']) {
  const RENAME: Record<string, string> = {
    hito: 'person',
    mono: 'thing',
    P: 'person',
    O: 'thing',
    A: 'action',
  }
  const renamed = oldSymbols.flatMap(({ id, ...s }: any) => {
    const links = (s.links ?? []).map((l: any) => ({
      ...l,
      role: RENAME[l.role] ?? l.role,
    }))
    const kanaOnly = (s.kanaOnly ?? []).map((k: any) => ({
      ...k,
      role: RENAME[k.role] ?? k.role,
    }))
    const same =
      JSON.stringify(links) === JSON.stringify(s.links) &&
      JSON.stringify(kanaOnly) === JSON.stringify(s.kanaOnly ?? [])
    return same ? [] : [{ id, ...s, links, kanaOnly }]
  })
  console.log(`role を書き換える記号 ${renamed.length}`)
  if (args.apply && renamed.length) {
    await commitAll(
      renamed.map(({ id, ...s }: any) => ({
        update: {
          name: `${root}/${SYMBOLS}/${id}`,
          fields: toFields(JSON.parse(JSON.stringify(s))),
        },
      }))
    )
    const s2 = await listAll(SYMBOLS)
    console.log(
      `書いた後: 違反 ${
        checkIntegrity({ symbols: s2, words: oldWords }).errors.length
      } / 食い違う番号 ${driftedNums(numbers, s2, oldWords).length}`
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
