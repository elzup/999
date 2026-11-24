// nr kana:long — よみから長音の «う» を消してしまった漢字の語を直す (将棋 しょぎ → しょｳぎ)。
// 規則は kana-long.js。所持 (しょじ) のように本当に う が無い語も候補に混ざるので、
// 機械では選ばず、人か LLM が選んだ答えだけを書く。
// 読むのはローカルの src/data/words.tsv (先に nr sync で取り直しておく)。
//
//   nr kana:long [44]                  候補を一覧に出す (番号の頭で絞れる)
//   nr kana:long --prompt [44]         LLM への依頼文を src/kana-long.out/batch-NN.txt に小分けで書く
//   nr kana:long --answers a.txt ...   LLM の答えを候補と突き合わせて出す (dry-run)
//   nr kana:long --answers a.txt ... --apply   DB → シートの順に書く (nr kana:skip と同じ経路)
//
// 依頼文と答えは語を含む私的データ。src/kana-long.out/ は gitignore 済み。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectLongVowelCandidates,
  parseAnswers,
  planLongDb,
  planLongSheet,
  toPromptBatches,
  validateAnswers,
} from './kana-long.js'
import { SLOT_KEYS } from './sheet-layout.js'
import { loadWords } from './words.js'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'kana-long.out')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const positional = args.filter((a) => !a.startsWith('--'))

function loadRows(prefix) {
  if (prefix && !/^\d{1,3}$/.test(prefix)) {
    console.error('番号の頭は 1〜3 桁の数字で指定する (例: nr kana:long 44)')
    process.exit(1)
  }
  let entries
  try {
    entries = loadWords()
  } catch {
    console.error('src/data/words.tsv が読めない。先に nr sync で取り直す')
    process.exit(1)
  }
  return collectLongVowelCandidates(entries, SLOT_KEYS, prefix)
}

function list(prefix) {
  const rows = loadRows(prefix)
  for (const { num, slot, word, kana, candidates } of rows) {
    console.log(`${num} ${slot} ${word}: ${kana} → ${candidates.join(' / ')}`)
  }
  console.log(
    `\n${rows.length} 枠${prefix ? ` (${prefix}…)` : ''}。読むだけで書き込みはしない`
  )
}

function prompt(prefix) {
  const batches = toPromptBatches(loadRows(prefix))
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  batches.forEach((body, i) => {
    const path = join(OUT_DIR, `batch-${String(i + 1).padStart(2, '0')}.txt`)
    writeFileSync(path, body)
    console.log(relative(process.cwd(), path))
  })
  console.log(
    `\n${batches.length} 件の依頼文。1 件ずつ LLM に渡し、答えを answer-NN.txt などに保存して` +
      '\n  nr kana:long --answers src/kana-long.out/answer-*.txt'
  )
}

async function answers(files) {
  const parsed = files.flatMap((f) => parseAnswers(readFileSync(f, 'utf8')))
  const { accepted, rejected } = validateAnswers(parsed, loadRows(''))
  for (const c of accepted) {
    console.log(`  ${c.num} ${c.slot} ${c.word}: ${c.from} → ${c.to}`)
  }
  console.log(`受け付けた: ${accepted.length} 枠`)
  if (rejected.length) {
    console.log(`\n弾いた: ${rejected.length} 行`)
    for (const r of rejected) console.log(`  ${r.id} ${r.to} (${r.reason})`)
  }
  if (!flag('--apply')) {
    console.log('\n(dry-run。--apply で DB → シートの順に書く)')
    return
  }
  if (accepted.length === 0) return
  // 書くときだけ認証の要る経路を読む (一覧・依頼文はオフラインで動かす)
  const { connectDb, readMainSheet, writeDbThenSheet } =
    await import('./kana-write.js')
  const db = connectDb()
  const dbPlan = planLongDb(await db.readAllNumbers(), accepted)
  const sheetCells = planLongSheet(await readMainSheet(), accepted)
  const dbCount = dbPlan.reduce((n, p) => n + p.changes.length, 0)
  console.log(`\nDB ${dbCount} 枠 / シート ${sheetCells.length} セルを書く`)
  if (dbCount !== accepted.length || sheetCells.length !== accepted.length) {
    console.log(
      '  (words.tsv と DB / シートのかなが違う枠は飛ばした。nr sync で取り直すと揃う)'
    )
  }
  await writeDbThenSheet(db, dbPlan, sheetCells)
  console.log('書き込み完了。nr sync でローカルの words.tsv を取り直すこと')
}

async function main() {
  if (flag('--answers')) {
    if (positional.length === 0) {
      console.error('答えのファイルを渡す (例: nr kana:long --answers a.txt)')
      process.exit(1)
    }
    return answers(positional)
  }
  if (flag('--prompt')) return prompt(positional[0] ?? '')
  return list(positional[0] ?? '')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
