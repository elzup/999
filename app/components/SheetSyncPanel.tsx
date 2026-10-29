import { useCallback, useEffect, useState } from 'preact/hooks'
import { loadEditorToken } from '../lib/editorAuth'
import { fetchSyncState, runSyncNow, type SyncStatus } from '../lib/syncApi'

/** シートの列名を画面の言葉に直す。かなは «人1» のように枠で言う */
const FIELD_LABELS: Record<string, string> = {
  hito: '人',
  mono: '物',
  wh1k: '人1 かな',
  wh2k: '人2 かな',
  wh3k: '人3 かな',
  wm1k: '物1 かな',
  wm2k: '物2 かな',
  wm3k: '物3 かな',
}

// 指紋の 1 グループ = 10 番号 = 2 文字 (src/firestore/fingerprint.js と揃える)
const GROUP_CHARS = 2
const GROUP_COUNT = 100

function formatTime(iso?: string | null) {
  if (!iso) return '未実行'
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 10×10 のマス。1 マス = 10 番号、行 = 100 番号。シートと DB で食い違うマスに色。
 * 数字の一覧と同じく 000 を下端に置いて上へ積む (D-0015)
 */
function FingerprintGrid({ sheet, db }: { sheet?: string; db?: string }) {
  if (!sheet || !db) return null
  const cells = Array.from({ length: GROUP_COUNT }, (_, i) => {
    const at = i * GROUP_CHARS
    return sheet.slice(at, at + GROUP_CHARS) !== db.slice(at, at + GROUP_CHARS)
  })
  const diffCount = cells.filter(Boolean).length
  return (
    <div class="sync-fp">
      <div class="sync-fp-grid grid-up">
        {cells.map((isDiff, i) => (
          <span
            key={i}
            class={isDiff ? 'sync-fp-cell is-diff' : 'sync-fp-cell'}
            title={`${String(i * 10).padStart(3, '0')}–${String(
              i * 10 + 9
            ).padStart(3, '0')}`}
          />
        ))}
      </div>
      <p class="activate-desc">
        {diffCount
          ? `シートと DB で ${diffCount} マス (10 番号ずつ) が食い違っています`
          : 'シートと DB の中身は一致しています'}
      </p>
    </div>
  )
}

/**
 * シート ⇄ アプリ (Firestore) の同期状況。両側で別の値に直したセルは
 * どちらにも書かずに残るので、ここで見せてどちらかで揃えてもらう。
 */
function SheetSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await fetchSyncState(loadEditorToken()))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const syncNow = useCallback(async () => {
    setIsBusy(true)
    try {
      await runSyncNow(loadEditorToken())
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }, [load])

  const state = status?.state
  const health = status?.health
  const report = state?.lastReport
  const conflicts = state?.conflicts ?? []
  const pending = state?.pending ?? []
  const sources = state?.sources

  return (
    <div class="activate-panel">
      <div class="activate-status">
        シート同期
        {health ? (
          <span class={`sync-health sync-health--${health.level}`}>
            {health.label}
          </span>
        ) : null}
      </div>
      <dl class="sync-facts">
        <dt>シート更新</dt>
        <dd>{formatTime(sources?.sheet?.contentUpdatedAt)}</dd>
        <dt>DB 更新</dt>
        <dd>{formatTime(sources?.db?.contentUpdatedAt)}</dd>
        <dt>最終同期</dt>
        <dd>{formatTime(state?.lastRunAt)}</dd>
        <dt>定期</dt>
        <dd>{formatTime(state?.cursor)}</dd>
        <dt>全件読み</dt>
        <dd>{formatTime(state?.lastFullAt)}</dd>
        {report ? (
          <>
            <dt>前回</dt>
            <dd>
              読 {report.read ?? 0} / DB へ {report.dbWritten ?? 0} / シートへ{' '}
              {report.sheetWritten ?? 0}
            </dd>
          </>
        ) : null}
        {pending.length ? (
          <>
            <dt>未反映</dt>
            <dd>{pending.join(', ')}</dd>
          </>
        ) : null}
      </dl>
      <FingerprintGrid
        sheet={sources?.sheet?.fingerprint}
        db={sources?.db?.fingerprint}
      />
      {state?.lastError ? (
        <p class="locked-error">
          {formatTime(state.lastError.at)} {state.lastError.message}
        </p>
      ) : null}
      {conflicts.length ? (
        <ul class="sync-conflicts">
          {conflicts.map((c) => (
            <li key={`${c.num}-${c.field}`} class="sync-conflict">
              <span class="sync-conflict-num">
                {c.num} {FIELD_LABELS[c.field] ?? c.field}
              </span>
              <span>シート「{c.sheet}」</span>
              <span>アプリ「{c.db}」</span>
            </li>
          ))}
        </ul>
      ) : null}
      {conflicts.length ? (
        <p class="activate-desc">
          両方で別の値に直されています。どちらかで同じ値に揃えると解消します。
        </p>
      ) : null}
      {error ? <p class="locked-error">{error}</p> : null}
      <button class="activate-link" onClick={syncNow} disabled={isBusy}>
        {isBusy ? '同期中…' : '今すぐ同期'}
      </button>
    </div>
  )
}

export default SheetSyncPanel
