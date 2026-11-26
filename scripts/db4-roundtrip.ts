// P2-6: 手元の全データ (番号 1,000・カード・FF) を v4 に変換し、整合検査と往復の差分を出す。DB に触らない。
// 使い方: node scripts/db4-roundtrip.ts [numbers.json] [--show N] [--merged out.md]
//   numbers.json の既定は .metarc/backup/ の一番新しい *-numbers/numbers.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parseCardsTsv } from '../src/cards-tsv.js'
import { fromLegacy } from '../src/db4/from-legacy.js'
import { checkIntegrity } from '../src/db4/integrity.js'
import { toCard, toFf, toNumberDoc } from '../src/db4/to-legacy.js'
import { canonicalJson } from '../src/firestore/number-doc.js'
import { sheetFormOfDoc } from '../src/firestore/sheet-bisync.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    show: { type: 'string', default: '10' },
    merged: { type: 'string' },
  },
})
const root = new URL('../', import.meta.url)
const latestNumbers = () => {
  const dir = new URL('.metarc/backup/', root)
  const name = readdirSync(dir)
    .filter((n) => n.endsWith('-numbers'))
    .sort()
    .at(-1)
  if (!name) throw new Error('.metarc/backup/*-numbers が無い')
  return new URL(`${name}/numbers.json`, dir)
}
const numbers = JSON.parse(
  readFileSync(positionals[0] ?? latestNumbers(), 'utf8')
)
const cards = parseCardsTsv(
  readFileSync(new URL('src/data/cards.tsv', root), 'utf8')
)
const ff = JSON.parse(readFileSync(new URL('private/ff.json', root), 'utf8'))

const { symbols, words } = fromLegacy({ numbers, cards, ff })
const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
const { errors, notices } = checkIntegrity({ symbols, words })

// 往復の期待値: 番号の一覧は sheetFormOfDoc と同じ (1〜3 番目は枠から)。評価は並びを見ない
const sortRatings = (list?: any[]) =>
  list && [...list].map((r) => canonicalJson(r)).sort()
const expectNumber = (doc: any) => {
  const { derived: _d, ...rest } = doc
  const form = sheetFormOfDoc(doc)
  return {
    ...rest,
    hito: form.hito,
    mono: form.mono,
    ratings: sortRatings(doc.ratings),
  }
}
const actualNumber = (doc: any) => ({
  ...doc,
  ratings: sortRatings(doc.ratings),
})

const symbolOf = new Map(symbols.map((s: any) => [s.id, s]))
const diffs = [
  ...numbers.map((doc: any) => {
    const id = `num:${doc.num}`
    const back = actualNumber(toNumberDoc(symbolOf.get(id), wordsById))
    return {
      id,
      want: canonicalJson(expectNumber(doc)),
      got: canonicalJson(back),
    }
  }),
  ...cards.map((card: any) => {
    const id = `card:${card.suit}${card.rank}`
    return {
      id,
      want: canonicalJson(card),
      got: canonicalJson(toCard(symbolOf.get(id), wordsById)),
    }
  }),
  ...ff.map((entry: any) => {
    const id = `hex:${String(entry.hex).toUpperCase()}`
    return {
      id,
      want: canonicalJson(entry),
      got: canonicalJson(toFf(symbolOf.get(id), wordsById)),
    }
  }),
].filter((d) => d.want !== d.got)

const show = Number(values.show)
const count = (pred: (l: any) => boolean) =>
  symbols.flatMap((s: any) => s.links).filter(pred).length
const shared = words.filter(
  (w: any) => symbols.filter((s: any) => s.wordIds.includes(w.id)).length > 1
)
console.log(
  `記号 ${symbols.length} (番号 ${numbers.length} / カード ${cards.length} / FF ${ff.length})、語 ${words.length}`
)
console.log(`複数の記号で共有する語: ${shared.length}`)
console.log(`綴りを raw で残した結び付き: ${count((l) => l.raw !== undefined)}`)
console.log(
  `代表: 語の ID ${
    symbols.flatMap((s: any) => s.rep?.picks ?? []).filter((p: any) => p.wordId)
      .length
  } / 文字列のまま ${
    symbols
      .flatMap((s: any) => s.rep?.picks ?? [])
      .filter((p: any) => !p.wordId).length
  }`
)
console.log(
  `評価: 語に付けた ${count(
    (l) => l.rating !== undefined && !String(l.role).match(/^[PAO]$/)
  )} / 語に結び付かない ${
    symbols.flatMap((s: any) => s.looseRatings ?? []).length
  }`
)
console.log(
  `\n整合検査: 違反 ${errors.length} / 同じ綴りの語 ${notices.length} 組`
)
for (const e of errors.slice(0, show))
  console.log(`  ${e.rule} ${e.symbol ?? e.word} ${e.detail}`)
console.log(`\n往復の差分: ${diffs.length}`)
for (const d of diffs.slice(0, show))
  console.log(`  ${d.id}\n    want ${d.want}\n    got  ${d.got}`)

if (values.merged) {
  const rows = shared.map(
    (w: any) =>
      `| ${w.id} | ${w.text}${w.source ? `#${w.source}` : ''} | ${symbols
        .filter((s: any) => s.wordIds.includes(w.id))
        .map((s: any) => s.id)
        .join(' ')} |`
  )
  const split = notices.map(
    (n: any) =>
      `| ${n.detail.split(': ')[1]} | ${n.words
        .map(
          (id: string) =>
            `${id} (${symbols
              .filter((s: any) => s.wordIds.includes(id))
              .map(
                (s: any) =>
                  `${s.id}:${s.links.find((l: any) => l.wordId === id).role}`
              )
              .join(' ')})`
        )
        .join('<br>')} |`
  )
  writeFileSync(
    values.merged,
    `# 移行で寄せた語・分けた語 (D-0163)\n\n生成: node scripts/db4-roundtrip.ts --merged\n\n## 寄せた語 (複数の記号で共有): ${
      shared.length
    }\n\n| 語の ID | 語 | 記号 |\n|---|---|---|\n${rows.join(
      '\n'
    )}\n\n## 同じ綴りで分けた語: ${
      notices.length
    }\n\n| 綴り | 語 (記号:role) |\n|---|---|\n${split.join('\n')}\n`
  )
  console.log(`\n一覧を ${values.merged} に書いた`)
}
process.exit(errors.length || diffs.length ? 1 : 0)
