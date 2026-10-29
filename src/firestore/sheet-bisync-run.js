// シート ⇄ Firestore の双方向同期を 1 回まわす。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// sheet と store を引数で受け取るのは、«読んでから書くまでに他の面が書いた»
// 状況をテストで作るため (writeNumber が db を受け取るのと同じ理由)。
//
//   sheet: { readRows(), writeCells(updates) }               ... sheet-io.js
//   store: { readBase(), writeBase(entries), readState(), writeState(state),
//            readChangedSince(iso|null), readNumbers(nums), writeNumber(write) }
//
// このモジュールは Function からも読み込む。fs 依存を持ち込まないこと。

import { fingerprint } from './fingerprint.js'
import {
  planNumber,
  sameAsBase,
  sheetFormOfDoc,
  sheetFormOfRow,
} from './sheet-bisync.js'

// cursor はこの回の開始時刻から少し戻す。別インスタンスの時計のずれで
// 境目の書き込みを取りこぼすと、その番号は base と違うまま二度と読まれない
export const CURSOR_MARGIN_MS = 2 * 60 * 1000
// 差分読みの前提 (読まなかった文書は base と同じ) が何かの理由で崩れても、
// 1 日 1 回は全件を読み直して自然に治るようにする
export const FULL_RESCAN_MS = 24 * 60 * 60 * 1000

/** シートの行を番号ごとにまとめる。同じ番号が 2 行あればどちらも使わない */
function indexRows(rows) {
  const forms = {}
  const rowNumbers = {}
  const duplicates = new Set()
  for (const row of rows) {
    if (row.num in forms) {
      duplicates.add(row.num)
      continue
    }
    forms[row.num] = sheetFormOfRow(row.cells)
    rowNumbers[row.num] = row.rowNumber
  }
  for (const num of duplicates) {
    delete forms[num]
  }
  return { forms, rowNumbers, duplicates: [...duplicates].sort() }
}

function shouldFullScan({ baseDoc, state, nowMs }) {
  if (!baseDoc || !state?.cursor) return true
  const lastFull = Date.parse(state.lastFullAt ?? '')
  return !Number.isFinite(lastFull) || nowMs - lastFull >= FULL_RESCAN_MS
}

/** 読むべき文書を集める。差分読み + シートで動いた番号 + 前回の積み残し */
async function loadDocs({ store, forms, base, state, only, isFull }) {
  if (only) return store.readNumbers(only)

  const changed = isFull
    ? await store.readChangedSince(null)
    : await store.readChangedSince(
        new Date(Date.parse(state.cursor) - CURSOR_MARGIN_MS).toISOString()
      )
  const wanted = new Set([
    ...(state?.pending ?? []),
    ...Object.keys(forms).filter((num) => !sameAsBase(forms[num], base[num])),
  ])
  const missing = [...wanted].filter((num) => !(num in changed))
  const extra = missing.length ? await store.readNumbers(missing) : {}
  return { ...changed, ...extra }
}

/** 計画だけ作る。書き込みは applyPlans */
function planAll({ forms, docs, base, now }) {
  const plans = []
  const missingRows = []
  const missingDocs = []
  for (const num of Object.keys(docs).sort()) {
    if (!(num in forms)) {
      missingRows.push(num)
      continue
    }
    plans.push({
      num,
      current: docs[num],
      ...planNumber({
        sheetForm: forms[num],
        doc: docs[num],
        base: base[num],
        now,
      }),
    })
  }
  for (const num of Object.keys(forms)) {
    if (!(num in docs) && !sameAsBase(forms[num], base[num])) {
      missingDocs.push(num)
    }
  }
  return { plans, missingRows, missingDocs: missingDocs.sort() }
}

async function applyPlans({ plans, sheet, store, rowNumbers, base }) {
  const failed = new Set()

  // DB を先に書く。シートは CAS が無いので、書く直前の読み直しで守る側に回す
  let dbWritten = 0
  const dbDocs = {}
  for (const plan of plans) {
    if (!plan.dbDoc) continue
    const result = await store.writeNumber({
      num: plan.num,
      doc: plan.dbDoc,
      expectedUpdatedAt: plan.current?.updatedAt ?? null,
    })
    if (result?.ok) {
      dbWritten++
      dbDocs[plan.num] = plan.dbDoc
    } else failed.add(plan.num)
  }

  const updates = plans.flatMap((plan) =>
    Object.entries(plan.sheetCells).map(([field, value]) => ({
      num: plan.num,
      rowNumber: rowNumbers[plan.num],
      field,
      value,
      expected: plan.sheetForm[field],
    }))
  )
  const { written = [], skipped = [] } = updates.length
    ? await sheet.writeCells(updates)
    : {}
  for (const skip of skipped) failed.add(skip.num)

  // base は両側が揃った番号だけ進める (REQ-BI-007)
  const nextBase = Object.fromEntries(
    plans
      .filter((plan) => !failed.has(plan.num))
      .filter((plan) => !sameAsBase(plan.nextBase, base[plan.num]))
      .map((plan) => [plan.num, plan.nextBase])
  )
  if (Object.keys(nextBase).length) await store.writeBase(nextBase)

  return {
    dbWritten,
    dbDocs,
    written,
    sheetWritten: written.length,
    skipped,
    failed: [...failed].sort(),
    baseAdvanced: Object.keys(nextBase).length,
  }
}

function summarize({ plans, missingRows, missingDocs, duplicates }) {
  return {
    planned: {
      db: plans.filter((p) => p.dbDoc).length,
      sheet: plans.filter((p) => Object.keys(p.sheetCells).length).length,
    },
    conflicts: plans.flatMap((p) =>
      p.conflicts.map((c) => ({ num: p.num, ...c }))
    ),
    bootstrapped: plans.flatMap((p) =>
      p.bootstrapped.map((b) => ({ num: p.num, ...b }))
    ),
    missingRows,
    missingDocs,
    duplicates,
  }
}

const latest = (a, b) => (!a ? b ?? null : !b ? a : a > b ? a : b)

/**
 * シートと DB の指紋と «内容の最終更新»。同期の書き込み時刻とは別に持つ (D-0027)。
 * DB は読まなかった文書を base と同じとみなす (差分読みと同じ前提。全件読みで治る)
 */
function nextSources({ prev, forms, docs, base, now, result }) {
  // この回で書いた分を重ねる。書く前の値で取ると、流した直後の 5 分間だけ
  // シートと DB の指紋が食い違って見えてしまう
  const sheetForms = result.written.reduce(
    (acc, w) => ({ ...acc, [w.num]: { ...acc[w.num], [w.field]: w.value } }),
    forms
  )
  const sheetFp = fingerprint(sheetForms)
  const dbForms = {
    ...base,
    ...Object.fromEntries(
      Object.entries({ ...docs, ...result.dbDocs }).map(([num, doc]) => [
        num,
        sheetFormOfDoc(doc),
      ])
    ),
  }
  const dbLatest = Object.values({ ...docs, ...result.dbDocs })
    .map((doc) => doc?.updatedAt ?? null)
    .reduce((acc, at) => latest(acc, at), prev?.db?.contentUpdatedAt ?? null)
  return {
    sheet: {
      fingerprint: sheetFp,
      // シートには内容の更新時刻が無いので、指紋が動いたのを見た回の時刻で代える
      contentUpdatedAt:
        prev?.sheet?.fingerprint === sheetFp
          ? prev.sheet.contentUpdatedAt ?? null
          : now,
    },
    db: { fingerprint: fingerprint(dbForms), contentUpdatedAt: dbLatest },
  }
}

/** 前回の状態に今回の結果を重ねる。番号指定の回は他の番号の記録を消さない */
function nextState({ state, only, isFull, now, report, failed, sources }) {
  const scope = only ? new Set(only) : null
  const keep = (list) =>
    scope ? list.filter((x) => !scope.has(x.num ?? x)) : []
  return {
    ...state,
    ...(only ? {} : { cursor: now }),
    ...(isFull && !only ? { lastFullAt: now } : {}),
    // 全体を回し切れたら前回のエラーは解消済み。番号指定の回では消さない
    ...(only ? {} : { lastError: null, sources }),
    lastRunAt: now,
    pending: [...new Set([...keep(state?.pending ?? []), ...failed])].sort(),
    conflicts: [...keep(state?.conflicts ?? []), ...report.conflicts],
    lastReport: {
      at: now,
      only: only ?? null,
      full: isFull,
      ...report.counts,
    },
  }
}

/**
 * @param apply false なら計画だけ返す (dry-run)
 * @param only  番号を絞る (アプリ保存直後の即時反映)
 */
export async function runBisync({ sheet, store, now, apply = true, only }) {
  const nowMs = Date.parse(now)
  const { rows } = await sheet.readRows()
  const { forms, rowNumbers, duplicates } = indexRows(rows)

  const baseDoc = await store.readBase()
  const base = baseDoc?.nums ?? {}
  const state = await store.readState()
  const isFull = !only && shouldFullScan({ baseDoc, state, nowMs })

  const docs = await loadDocs({ store, forms, base, state, only, isFull })
  const { plans, missingRows, missingDocs } = planAll({
    forms,
    docs,
    base,
    now,
  })
  const plansWithForm = plans.map((plan) => ({
    ...plan,
    sheetForm: forms[plan.num],
  }))
  const summary = summarize({
    plans: plansWithForm,
    missingRows,
    missingDocs,
    duplicates,
  })

  if (!apply)
    return {
      applied: false,
      isFull,
      read: Object.keys(docs).length,
      ...summary,
      plans: plansWithForm,
    }

  const result = await applyPlans({
    plans: plansWithForm,
    sheet,
    store,
    rowNumbers,
    base,
  })
  const report = {
    conflicts: summary.conflicts,
    counts: {
      read: Object.keys(docs).length,
      dbWritten: result.dbWritten,
      sheetWritten: result.sheetWritten,
      conflicts: summary.conflicts.length,
      failed: result.failed.length,
      bootstrapped: summary.bootstrapped.length,
    },
  }
  const sources = only
    ? null
    : nextSources({ prev: state?.sources, forms, docs, base, now, result })
  await store.writeState(
    nextState({
      state,
      only,
      isFull,
      now,
      report,
      failed: result.failed,
      sources,
    })
  )
  const { dbDocs: _dbDocs, written: _written, ...rest } = result
  return { applied: true, isFull, ...summary, ...rest, counts: report.counts }
}
