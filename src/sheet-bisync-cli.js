// シート ⇄ Firestore の双方向同期を手元から 1 回まわす。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
//   nr sheet:bisync            dry-run (既定。何も書かない)
//   nr sheet:bisync --apply    実際に書く
//   nr sheet:bisync --only 001,002
//   nr sheet:status            同期の状態を見る (読むだけ)
//   nr sheet:status --write-sheet   状態をシートの sync タブにも書く
//
// 本番は Function sheetSync が 5 分おきに回す。これは初回の中身を目で見るのと、
// Function が止まっているときの手動実行用。
// シートは GOOGLE_SERVICE_ACCOUNT_PATH の鍵、Firestore は db.js の認証解決に従う。

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBisyncStore } from './firestore/bisync-store.js'
import { connect } from './firestore/db.js'
import { connectRest } from './firestore/rest.js'
import { createSheetIo, writeStatusTab } from './firestore/sheet-io.js'
import { runBisync } from './firestore/sheet-bisync-run.js'
import { fingerprintLines } from './firestore/fingerprint.js'
import {
  STATUS_TAB,
  sourceDiff,
  stateWithError,
  statusRows,
  syncHealth,
} from './firestore/sync-status.js'
import { fingerprintOfEntries, readWordsMeta } from './words-cache-meta.js'
import {
  getSheetTitleByGid,
  parseSpreadsheetUrl,
  sheetsApi,
} from './google-sheets.js'

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM/edit?gid=0#gid=0'
// 一覧が長いと要点が流れるので、各一覧はこの件数まで出す
const SHOW_LIMIT = Number(process.env.SHOW_LIMIT) || 30

const APPLY = process.argv.includes('--apply')
const STATUS = process.argv.includes('--status')
const WRITE_SHEET = process.argv.includes('--write-sheet')
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? process.argv[i + 1].split(',') : undefined
})()

const log = (...args) => console.log(...args)

const PROJECT_ID = 'anoz-memosupo'

/**
 * 個人ログインのトークンしか無いときの読み取り専用の口。Admin SDK はトークンを
 * 受け付けないので REST で読む。書き込みはしないので --apply とは併用させない
 */
function createReadOnlyStore(token) {
  const db = connectRest({ projectId: PROJECT_ID, token })
  let all = null
  const readAll = async () => (all ??= await db.readAllNumbers())
  const refuse = async () => {
    throw new Error('読み取り専用の口では書き込めない')
  }
  return {
    readBase: async () => (await db.readDoc('sync', 'sheetBase')) ?? null,
    readState: async () => (await db.readDoc('sync', 'sheetState')) ?? null,
    async readChangedSince(iso) {
      const docs = await readAll()
      return Object.fromEntries(
        Object.entries(docs).filter(
          ([, d]) => !iso || (d.updatedAt ?? '') > iso
        )
      )
    },
    async readNumbers(nums) {
      const docs = await readAll()
      return Object.fromEntries(
        nums.filter((n) => docs[n]).map((n) => [n, docs[n]])
      )
    },
    writeBase: refuse,
    writeState: refuse,
    writeNumber: refuse,
  }
}

function storeOf() {
  const token = process.env.FIRESTORE_ACCESS_TOKEN
  if (!token) return createBisyncStore(connect())
  if (APPLY)
    throw new Error(
      'FIRESTORE_ACCESS_TOKEN では --apply できない (読み取り専用)'
    )
  return createReadOnlyStore(token)
}

function showList(label, list, format) {
  if (!list.length) return
  log(`\n${label}: ${list.length} 件`)
  for (const item of list.slice(0, SHOW_LIMIT)) log(`  ${format(item)}`)
  if (list.length > SHOW_LIMIT) log(`  … ほか ${list.length - SHOW_LIMIT} 件`)
}

function showPlans(plans) {
  const changes = plans.flatMap((p) => [
    ...Object.entries(p.sheetCells).map(
      ([field, value]) =>
        `${p.num} シート ${field}: ${JSON.stringify(
          p.sheetForm[field]
        )} → ${JSON.stringify(value)}`
    ),
    ...(p.dbDoc ? [`${p.num} DB 書き直し`] : []),
  ])
  showList('書き込み予定', changes, (line) => line)
}

const sheetTarget = () =>
  parseSpreadsheetUrl(process.env.SHEET_URL_SYNC || DEFAULT_SHEET_URL)

async function writeSheetStatus(store, spreadsheetId) {
  const { written } = await writeStatusTab({
    sheetsApi,
    spreadsheetId,
    tab: STATUS_TAB,
    rows: statusRows(await store.readState()),
  })
  log(
    written
      ? `シートの ${STATUS_TAB} タブに状態を書いた`
      : `シートの ${STATUS_TAB} タブは変わらないので書いていない`
  )
}

const jst = (iso) =>
  iso
    ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '不明'

// 和文は端末で 2 桁ぶん取るので、表示幅で揃える
const LABEL_WIDTH = 6
const padWidth = (text) =>
  text +
  ' '.repeat(
    Math.max(
      0,
      LABEL_WIDTH -
        [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
    )
  )

/** PC 側は words.tsv から指紋を取り直す。時刻は nr sync が残したメタから */
function pcSource() {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    'data',
    'words.tsv'
  )
  if (!existsSync(path)) return null
  const [head, ...lines] = readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
  const keys = head.split('\t')
  const entries = lines.map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']))
  })
  const fp = fingerprintOfEntries(entries)
  const meta = readWordsMeta()
  return {
    fingerprint: fp,
    // メタが今の words.tsv と食い違うなら、メタ導入前の nr sync の結果
    contentUpdatedAt: meta?.fingerprint === fp ? meta.contentUpdatedAt : null,
    syncedAt: meta?.syncedAt ?? null,
  }
}

/** 3 ソースの指紋を 1 行 100 番号で並べ、シートと食い違う十の位に ^^ を付ける */
function showFingerprints(sources) {
  const named = Object.entries(sources).filter(([, src]) => src?.fingerprint)
  if (!named.length) return
  const base = named[0][1].fingerprint
  log('\n指紋 (1 行 = 100 番号、2 文字 = 10 番号)')
  const linesOf = Object.fromEntries(
    named.map(([name, src]) => [name, fingerprintLines(src.fingerprint)])
  )
  const baseLines = fingerprintLines(base)
  for (let row = 0; row < 10; row++) {
    const head = String(row * 100).padStart(3, '0')
    for (const [name] of named) {
      log(`  ${head} ${padWidth(name)} ${linesOf[name][row]}`)
    }
    const marks = named
      .slice(1)
      .map(([name]) => linesOf[name][row])
      .reduce(
        (acc, line) =>
          acc.map((m, i) =>
            line.slice(i * 2, i * 2 + 2) !==
            baseLines[row].slice(i * 2, i * 2 + 2)
              ? '^^'
              : m
          ),
        Array(10).fill('  ')
      )
      .join('')
    if (marks.trim()) log(`             ${marks}`)
  }
}

async function showStatus() {
  const store = storeOf()
  const state = await store.readState()
  const health = syncHealth(state, Date.now())
  const report = state?.lastReport ?? {}
  const sources = {
    シート: state?.sources?.sheet,
    DB: state?.sources?.db,
    PC: pcSource(),
  }
  log(`状態: ${health.label}`)
  log(
    `  最終同期: ${jst(state?.lastRunAt)}  (定期 ${jst(
      state?.cursor
    )} / 全件読み ${jst(state?.lastFullAt)})`
  )
  log(
    `  前回: 読 ${report.read ?? 0} / DB へ ${
      report.dbWritten ?? 0
    } / シートへ ${report.sheetWritten ?? 0}`
  )
  log(
    `  衝突 ${state?.conflicts?.length ?? 0} / 未反映 ${
      state?.pending?.length ?? 0
    } ${(state?.pending ?? []).join(',')}`
  )
  if (state?.lastError)
    log(`  エラー: ${jst(state.lastError.at)} ${state.lastError.message}`)

  log('\n内容の最終更新')
  for (const [name, src] of Object.entries(sources)) {
    const extra = name === 'PC' && src ? `  (nr sync ${jst(src.syncedAt)})` : ''
    log(
      `  ${padWidth(name)} ${src ? jst(src.contentUpdatedAt) : 'なし'}${extra}`
    )
  }
  log(
    `  シート↔DB の食い違い: ${sourceDiff(
      sources.シート?.fingerprint,
      sources.DB?.fingerprint
    )}`
  )
  log(
    `  シート↔PC の食い違い: ${sourceDiff(
      sources.シート?.fingerprint,
      sources.PC?.fingerprint
    )}`
  )
  showFingerprints(sources)

  showList(
    '衝突',
    state?.conflicts ?? [],
    (c) =>
      `${c.num} ${c.field}: sheet=${JSON.stringify(
        c.sheet
      )} db=${JSON.stringify(c.db)} base=${JSON.stringify(c.base)}`
  )
  if (WRITE_SHEET) await writeSheetStatus(store, sheetTarget().spreadsheetId)
  // スクリプトや監視から使えるよう、OK 以外は終了コードで返す
  if (health.level !== 'ok') process.exitCode = 2
}

async function runOnce(store, sheet) {
  const now = new Date().toISOString()
  try {
    return await runBisync({ sheet, store, now, apply: APPLY, only })
  } catch (error) {
    if (APPLY) {
      await store.writeState(
        stateWithError(await store.readState(), error, now)
      )
    }
    throw error
  }
}

async function main() {
  if (STATUS) return showStatus()

  const { spreadsheetId, gid } = sheetTarget()
  const title = await getSheetTitleByGid(spreadsheetId, gid)
  const sheet = createSheetIo({ sheetsApi, spreadsheetId, title })
  const store = storeOf()

  log(APPLY ? '=== 適用モード ===' : '=== dry-run (--apply で書き込み) ===')
  const result = await runOnce(store, sheet).finally(() =>
    APPLY && !only ? writeSheetStatus(store, spreadsheetId) : null
  )

  log(`全件読み: ${result.isFull ? 'はい' : 'いいえ'}`)
  if (result.plans) {
    log(`読んだ文書 ${result.read} 件`)
    showPlans(result.plans)
  } else {
    log(JSON.stringify(result.counts))
  }
  showList(
    '初回の採用 (base が無いので片側を採った)',
    result.bootstrapped,
    (b) =>
      `${b.num} ${b.field}: sheet=${JSON.stringify(
        b.sheet
      )} db=${JSON.stringify(b.db)} → ${b.chosen}`
  )
  showList(
    '衝突 (両側で別の値。どちらも書いていない)',
    result.conflicts,
    (c) =>
      `${c.num} ${c.field}: sheet=${JSON.stringify(
        c.sheet
      )} db=${JSON.stringify(c.db)} base=${JSON.stringify(c.base)}`
  )
  showList('シートに行が無い番号', result.missingRows, (n) => n)
  showList('DB に文書が無い番号', result.missingDocs, (n) => n)
  showList('シートで重複している番号', result.duplicates, (n) => n)
  if (result.skipped?.length) {
    showList(
      '書く直前に変わっていたセル',
      result.skipped,
      (s) => `${s.num} ${s.field} (${s.reason})`
    )
  }
  if (!APPLY) log('\n書き込んでいない。--apply で実行する')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
