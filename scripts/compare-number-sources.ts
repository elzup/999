// numbers から読んだ番号の文書と、symbols / words から組み立てた文書が全件で同じかを比べる。読むだけ。
// DB 作り直しの段 5 (読みの切り替え) の前後に流す。spec: .metarc/db-design-targets.md §5
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/compare-number-sources.ts --project demo-999
//   node scripts/compare-number-sources.ts --prod        本番 (FIRESTORE_ACCESS_TOKEN か ADC)
//
// 評価 (ratings) の並びは意味を持たない (find / filter でしか使わない) ので並べ替えてから比べる。
import { parseArgs } from 'node:util'
import { connect } from '../src/firestore/db.js'

const { values: args } = parseArgs({
  options: {
    project: { type: 'string' },
    prod: { type: 'boolean', default: false },
    show: { type: 'string', default: '10' },
  },
})

function projectOf(): string {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  if (args.prod) {
    if (emulator)
      throw new Error('--prod なのに FIRESTORE_EMULATOR_HOST がある')
    return 'anoz-memosupo'
  }
  if (!emulator || !args.project?.startsWith('demo-')) {
    throw new Error(
      'emulator (FIRESTORE_EMULATOR_HOST) と demo- の --project が要る。本番は --prod'
    )
  }
  return args.project
}

type Doc = Record<string, unknown>

const sortRatings = (doc: Doc): Doc =>
  Array.isArray(doc.ratings)
    ? {
        ...doc,
        ratings: [...doc.ratings].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        ),
      }
    : doc

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Doc)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const projectId = projectOf()
const fromNumbers = (await connect({
  projectId,
  source: 'numbers',
}).readChangedSince(null)) as Record<string, Doc>
const fromSymbols = (await connect({
  projectId,
  source: 'symbols',
}).readChangedSince(null)) as Record<string, Doc>

const nums = [
  ...new Set([...Object.keys(fromNumbers), ...Object.keys(fromSymbols)]),
].sort()
const diffs = nums.flatMap((num) => {
  const a = fromNumbers[num]
  const b = fromSymbols[num]
  if (!a) return [{ num, reason: 'symbols にだけある' }]
  if (!b) return [{ num, reason: 'numbers にだけある' }]
  if (canonical(sortRatings(a)) === canonical(sortRatings(b))) return []
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => canonical(a[k]) !== canonical(b[k]) && k !== 'ratings'
  )
  return [{ num, reason: 'differs', fields }]
})

console.log(
  JSON.stringify(
    {
      projectId,
      numbers: Object.keys(fromNumbers).length,
      symbols: Object.keys(fromSymbols).length,
      diffs: diffs.length,
      sample: diffs.slice(0, Number(args.show)),
    },
    null,
    1
  )
)
process.exit(diffs.length ? 1 : 0)
