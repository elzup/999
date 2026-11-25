// 規則表を変えたとき、登録済みの語を新しい規則で読める番号へ移す。
//
//   npx -y tsx scripts/rule-migrate.ts [--from <rev>] [--keep <番号:語>]... [--apply]
//
// --from の版の src/data/double_digit.tsv を «旧規則»、手元の src/data/*.tsv を «新規則» として、
// 旧規則で番号どおりに読めて新規則では読めなくなった語を、新規則で読める番号へ移す。
// 計画の規則は app/lib/ruleMigrate.ts (移し方はアプリの «別の番号へ移す» と同じ)。
// 既定は dry-run (計画を出すだけ)。--apply で DB に書く。
//
// 既定の --from は 28=ちゃ / 58=ふぁ を 28=ふぁ / 58=ちゃ に入れ替える前の main。
// 2 桁表 (double_digit.tsv) 以外の表を変えたときは、この読み込みも広げること。
//
// 書くのは DB (numbers/*) だけ。シートは sheetSync (5 分おき) が DB から写す (アプリの移動と同じ経路)。
// 1 語ずつ «移動先に足す → 移動先の評価 → 移動元から抜く → 移動元の代表» の順に書く。
// 途中で失敗しても語が両方に残るだけで、消えはしない順番。書く直前に 2 文書を読み直して計画し直す。
//
// 終わったら: nr deploy (Function の規則表を新しくする) → nr sync:all → nr deploy (配信データ)。
//
// 認証: FIRESTORE_ACCESS_TOKEN か、無ければ gcloud auth print-access-token
//       (GCLOUD_ACCOUNT があればそのアカウント)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { RulesData } from '../app/data/schema'
import type { NumberDoc } from '../app/lib/numberApi'
import { planMove, sameValue, slotRows } from '../app/lib/numberDetail'
import { tablesFromRules } from '../app/lib/reading'
import { planRuleMigration } from '../app/lib/ruleMigrate'
import { connectRest } from '../src/firestore/rest.js'
import {
  saveRating,
  saveRep,
  saveSlots,
} from '../src/firestore/console-writes.js'
import {
  DOUBLE_DIGIT,
  LONG_DIGIT,
  SINGLE_DIGIT,
  SINGLE_TIER,
} from '../src/table.js'

const PROJECT_ID = 'anoz-memosupo'
/** 28 / 58 を入れ替える前の main */
const DEFAULT_FROM = '2588c16'
const SOURCE = 'console'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 計画の書き出し先 (gitignore 済み。語は私的データ) */
const REPORT_PATH = join(root, 'src', 'rule-migrate.out.json')

const { values: args } = parseArgs({
  options: {
    from: { type: 'string', default: DEFAULT_FROM },
    apply: { type: 'boolean', default: false },
    // 移さずに残す語。«番号:語» で何度でも (--keep '288:茶葉')
    keep: { type: 'string', multiple: true, default: [] },
  },
})

const keep = (args.keep ?? []).map((spec) => {
  const at = spec.indexOf(':')
  if (at < 0) throw new Error(`--keep は «番号:語»: ${spec}`)
  return { num: spec.slice(0, at), word: spec.slice(at + 1) }
})

function firestoreToken(): string {
  if (process.env.FIRESTORE_ACCESS_TOKEN) {
    return process.env.FIRESTORE_ACCESS_TOKEN
  }
  const gcloudArgs = ['auth', 'print-access-token']
  if (process.env.GCLOUD_ACCOUNT) {
    gcloudArgs.push(`--account=${process.env.GCLOUD_ACCOUNT}`)
  }
  return execFileSync('gcloud', gcloudArgs).toString().trim()
}

const emptyMatrix = () =>
  Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => [] as string[])
  )

/** かな → 2 桁 の表を 10×10 のマスへ (generate-preview-data.js#buildRulesData と同じ形) */
function matrixOf(map: Record<string, string>): string[][][] {
  const matrix = emptyMatrix()
  for (const [kana, digits] of Object.entries(map)) {
    if (digits.length !== 2) continue
    matrix[Number(digits[0])][Number(digits[1])].push(kana)
  }
  return matrix
}

/** double_digit.tsv の中身 → 10×10 のマス (src/table.js#parseDoubleDigitTsv と同じ読み方) */
function matrixOfTsv(tsv: string): string[][][] {
  const lines = tsv
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))
  const cols = lines[0].split('\t').slice(1).map(Number)
  const matrix = emptyMatrix()
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const row = Number(cells[0])
    cells.slice(1).forEach((cell, j) => {
      for (const kana of (cell ?? '').split('/')) {
        if (kana.trim()) matrix[row][cols[j]].push(kana.trim())
      }
    })
  }
  return matrix
}

function newRules(): RulesData {
  const singleByDigit: RulesData['singleByDigit'] = {}
  for (let d = 0; d <= 9; d++) singleByDigit[d] = { core: [], sub: [], bad: [] }
  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const tier = SINGLE_TIER[kana] as 'core' | 'sub' | 'bad' | undefined
    if (tier) singleByDigit[digit][tier]!.push(kana)
  }
  return {
    singleByDigit,
    doubleMatrix: matrixOf(DOUBLE_DIGIT),
    longMatrix: matrixOf(LONG_DIGIT),
    weights: {},
  }
}

function oldRules(rev: string, current: RulesData): RulesData {
  const tsv = execFileSync(
    'git',
    ['show', `${rev}:src/data/double_digit.tsv`],
    { cwd: root }
  ).toString()
  return { ...current, doubleMatrix: matrixOfTsv(tsv) }
}

type Db = ReturnType<typeof connectRest>
type WriteResult = { ok?: boolean; error?: string; doc?: NumberDoc }

async function readNumber(db: Db, num: string): Promise<NumberDoc> {
  const doc = (await db.readDoc('numbers', num)) as NumberDoc | undefined
  return doc ?? { num, slots: {} }
}

function settled(result: WriteResult, what: string): NumberDoc {
  if (result?.error || !result?.doc) {
    throw new Error(`${what}: ${result?.error ?? '書き込みの結果が無い'}`)
  }
  return result.doc
}

/** 1 語を移す。書く直前の 2 文書で計画し直す */
async function applyMove(
  db: Db,
  move: { from: string; to: string; word: string; kana: string }
) {
  const source = await readNumber(db, move.from)
  const target = await readNumber(db, move.to)
  const row = slotRows(source).find((r) =>
    sameValue({ k: r.kana, w: r.word }, { k: move.kana, w: move.word })
  )
  if (!row)
    throw new Error(`${move.from} に ${move.word} が無い (読み直した文書)`)
  const plan = planMove(source, row, target)
  if (!plan.ok) throw new Error(`${move.from} → ${move.to}: ${plan.error}`)

  const now = () => new Date().toISOString()
  const label = `${move.from} ${move.word} → ${move.to}`
  let targetDoc = settled(
    await saveSlots(db, {
      num: move.to,
      slots: plan.targetSlots,
      current: target,
      now: now(),
      source: SOURCE,
    }),
    `${label} (移動先に足す)`
  )
  if (plan.rating) {
    targetDoc = settled(
      await saveRating(db, {
        num: move.to,
        ...plan.rating,
        current: targetDoc,
        now: now(),
        source: SOURCE,
      }),
      `${label} (移動先の評価)`
    )
  }
  let sourceDoc = settled(
    await saveSlots(db, {
      num: move.from,
      slots: plan.sourceSlots,
      current: source,
      now: now(),
      source: SOURCE,
    }),
    `${label} (移動元から抜く。移動先には足してある)`
  )
  if (plan.sourceRep) {
    sourceDoc = settled(
      await saveRep(db, {
        num: move.from,
        ...plan.sourceRep,
        current: sourceDoc,
        now: now(),
        source: SOURCE,
      }),
      `${label} (移動元の代表。語は移し終えている)`
    )
  }
  return plan.targetSlot
}

async function main() {
  const rulesNow = newRules()
  const oldTables = tablesFromRules(oldRules(args.from!, rulesNow))
  const newTables = tablesFromRules(rulesNow)

  const db = connectRest({ projectId: PROJECT_ID, token: firestoreToken() })
  const docs = (await db.readAllNumbers()) as Record<string, NumberDoc>
  const { moves, manual } = planRuleMigration(docs, oldTables, newTables, keep)

  console.log(`旧規則: ${args.from} の double_digit.tsv / 新規則: 手元の表`)
  console.log(`\n移す語: ${moves.length} 個`)
  for (const m of moves) {
    console.log(
      `  ${m.from} ${m.slot} ${m.word} (${m.kana}) → ${m.to} ${m.targetSlot}`
    )
  }
  console.log(`\n移さず手で直す語: ${manual.length} 個`)
  for (const m of manual) {
    console.log(`  ${m.num} ${m.slot} ${m.word} (${m.kana}): ${m.reason}`)
  }
  writeFileSync(REPORT_PATH, JSON.stringify({ moves, manual }, null, 2) + '\n')
  console.log(`\n計画を ${REPORT_PATH} に書いた`)

  if (!args.apply) {
    console.log('\n(dry-run。--apply で DB に書く)')
    return
  }
  let done = 0
  for (const move of moves) {
    try {
      const slot = await applyMove(db, move)
      done += 1
      console.log(`  済 ${move.from} ${move.word} → ${move.to} ${slot}`)
    } catch (err) {
      throw new Error(
        `${(err as Error).message}\n${done}/${moves.length} 個まで移した。` +
          'もう一度実行すると、残りを今の DB から計画し直す (途中で止まった語は両方に残っているので、移動元から手で消す)'
      )
    }
  }
  console.log(
    `\n${done} 個を移した。シートは sheetSync が写す。` +
      'nr deploy → nr sync:all → nr deploy で規則表と配信データを新しくすること'
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
