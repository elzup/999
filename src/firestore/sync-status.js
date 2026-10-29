// 双方向同期の «今どうなっているか» を sheetState から組み立てる。
// アプリ (/sync/status)・CLI (nr sheet:status)・シートの sync タブが同じ判定を見る。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// このモジュールは Function からも読み込む。fs 依存を持ち込まないこと。

import { diffGroups, fingerprintLines, groupLabel } from './fingerprint.js'

// 定期は 5 分おき。3 回ぶん続けて来なければ Scheduler か Function が止まっている
export const STALE_MS = 15 * 60 * 1000
export const STATUS_TAB = 'sync'

const LABELS = {
  ok: 'OK',
  conflict: '衝突あり',
  pending: '未反映あり',
  stale: '止まっている',
  error: 'エラー',
  never: '未実行',
}

/**
 * 重い順に 1 つ選ぶ。error > stale > conflict > pending > ok。
 * 止まっている間は衝突の件数も古いので、stale を衝突より上に置く
 */
export function syncHealth(state, nowMs) {
  if (!state?.lastRunAt) return { level: 'never', label: LABELS.never }
  if (state.lastError) return { level: 'error', label: LABELS.error }
  // 即時反映の回も lastRunAt を進めるので、定期が止まっても隠れてしまう。
  // cursor は全体を回した回だけが進める
  const lastMs = Date.parse(state.cursor ?? '')
  if (!Number.isFinite(lastMs) || nowMs - lastMs > STALE_MS) {
    return { level: 'stale', label: LABELS.stale }
  }
  if (state.conflicts?.length) {
    return { level: 'conflict', label: LABELS.conflict }
  }
  if (state.pending?.length) return { level: 'pending', label: LABELS.pending }
  return { level: 'ok', label: LABELS.ok }
}

/** 失敗した回の記録。前回までの結果は残し、エラーだけ重ねる */
export function stateWithError(state, error, now) {
  return {
    ...state,
    lastError: { at: now, message: String(error?.message ?? error) },
  }
}

const jst = (iso) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : ''

/** 食い違うグループを «230-239, 500-509» の形で */
export function sourceDiff(a, b) {
  if (!a || !b) return '比較できない (指紋が無い)'
  const groups = diffGroups(a, b)
  return groups.length ? groups.map(groupLabel).join(', ') : 'なし'
}

/**
 * シートの sync タブに書く 2 次元配列。A 列が見出し、B 列以降が値。
 *
 * 回ごとに変わる値 (最終同期の時刻・読んだ件数) は入れない。中身が前回と同じなら
 * 書かずに済ませ、版の履歴を 5 分おきに積まないため (D-0028)。そのぶん «止まっている»
 * はシートでは分からないので、状態は定期の最終回の時点で判定する
 */
export function statusRows(state) {
  const health = syncHealth(state, Date.parse(state?.cursor ?? ''))
  const conflicts = state?.conflicts ?? []
  const pending = state?.pending ?? []
  const sheet = state?.sources?.sheet
  const db = state?.sources?.db
  const lines = (fp) => fingerprintLines(fp).join('\n')
  return [
    ['状態', health.label],
    ['衝突', conflicts.length],
    ['未反映', pending.length, pending.join(',')],
    [
      'エラー',
      state?.lastError?.message ?? '',
      jst(state?.lastError?.at ?? ''),
    ],
    [],
    ['ソース', '内容の最終更新', '指紋 (1 行 = 100 番号、2 文字 = 10 番号)'],
    ['シート', jst(sheet?.contentUpdatedAt), lines(sheet?.fingerprint)],
    ['DB', jst(db?.contentUpdatedAt), lines(db?.fingerprint)],
    ['食い違い', sourceDiff(sheet?.fingerprint, db?.fingerprint)],
    [],
    ['衝突の番号', '列', 'シート', 'アプリ', 'base'],
    ...conflicts.map((c) => [c.num, c.field, c.sheet, c.db, c.base]),
    [],
    [
      '※ 中身が変わったときだけ書き直す。同期が回っているかはアプリの設定 > シート同期か nr sheet:status で見る',
    ],
  ]
}
