// 番号単位の統合ビュー。
// spec: .vsdd/firestore-store/specs/spec-number-detail-view.md
// UI 案: .metarc/editor-ui-drafts-v2.html の A-2 (カード型) + B-1 (⠿ ドラッグ)
//
// 4 つの面 (シート / 編集画面 / 代表語コンソール / 画像コンソール) に散っていた
// 操作を 1 番号ぶんの 1 画面に集める。読み書きは numbers/{num} だけを見る。

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { fetchNumber, patchNumber, type PatchOp } from '../lib/numberApi'
import {
  applyDraftEdit,
  applyFailure,
  applySaved,
  changedSlots,
  livePicks,
  nextFreeSlot,
  type SlotFamily,
  mergeDraftRows,
  moveItem,
  nextRatingValue,
  planMove,
  RATING_VALUES,
  repPickOp,
  slotRows,
  slotsFromRows,
  type DetailState,
  type SlotRow,
  withDeliveredImages,
} from '../lib/numberDetail'
import type { NumberEntry, RulesData } from '../data/schema'
import {
  checkReading,
  readingOf,
  tablesFromRules,
  type ReadingCheck,
  type ReadingTables,
} from '../lib/reading'
import Rankey from './Rankey'
import Screen, { DockBar, QuitButton } from './Screen'

const REP_RANKS = [1, 2] as const
const REP_LABEL: Record<1 | 2, string> = { 1: '①', 2: '②' }

const RATING_LABEL: Record<number, string> = {
  [-1]: '−1',
  [0]: '0',
  [1]: '+1',
  [2]: '+2',
}

const EMPTY: DetailState = { doc: null, status: '', saving: false }

// 成功の知らせを出しておく時間。失敗の理由は次の操作まで残す
const NOTICE_MS = 2000

export default function NumberDetailTab({
  token,
  initialNum = '000',
  focusSlot,
  numbers,
  rules,
  onClose,
}: {
  token: string
  /** 読みルール。かなが番号の読みになっているかの確認と、付け替え先の提案に使う */
  rules?: RulesData
  /** 配信データ。numbers/{num} に無い画像をここから補う */
  numbers?: NumberEntry[]
  initialNum?: string
  /** 999 タブで語をタップして入ったとき、その語にカーソルを置く (REQ-NDV-012) */
  focusSlot?: string
  onClose?: () => void
}) {
  const [num, setNum] = useState(initialNum)
  const [jump, setJump] = useState(initialNum)
  const [state, setState] = useState<DetailState>(EMPTY)
  const [loading, setLoading] = useState(false)
  // 未保存の編集内容。保存に成功したら doc 側に取り込むので、ここは空に戻る
  const [drafts, setDrafts] = useState<Record<string, SlotRow>>({})
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  // 別の番号へ移す欄を開いている枠
  const [moving, setMoving] = useState<string | null>(null)
  const tables = useMemo(() => (rules ? tablesFromRules(rules) : null), [rules])

  const load = useCallback(
    (target: string) => {
      if (!token) return
      setLoading(true)
      setDrafts({})
      setMoving(null)
      fetchNumber(target, token)
        .then((doc) => setState({ doc, status: '', saving: false }))
        .catch((error) =>
          setState({
            doc: null,
            status: String(error.message),
            saving: false,
            failed: true,
          })
        )
        .finally(() => setLoading(false))
    },
    [token]
  )

  useEffect(() => load(num), [num, load])

  useEffect(() => {
    if (!state.status || state.failed) return
    const timer = setTimeout(
      () => setState((prev) => ({ ...prev, status: '' })),
      NOTICE_MS
    )
    return () => clearTimeout(timer)
  }, [state.status, state.failed])

  const send = useCallback(
    async (op: PatchOp, message?: string) => {
      const doc = state.doc
      if (!doc || state.saving) return

      setState((prev) => ({ ...prev, saving: true, status: '' }))
      try {
        const saved = await patchNumber({
          num: doc.num,
          token,
          op,
          // 読んだ時点を添える。ここが古ければサーバが 409 で止める
          expectedUpdatedAt: doc.updatedAt ?? null,
        })
        // 代表・評価の保存で未保存の編集 (追加したばかりの候補など) を捨てない。
        // 下書きは slots を保存したときだけ保存済みの内容に置き換わる
        if (op.op === 'slots') setDrafts({})
        setState((prev) => applySaved(prev, saved, message))
      } catch (error) {
        setState((prev) => applyFailure(prev, error))
      }
    },
    [state.doc, state.saving, token]
  )

  const doc = state.doc
  // 表示行 = 保存済みの内容に、未保存の編集を重ねたもの
  const entry = numbers?.find((item) => item.num === doc?.num)
  const rows: SlotRow[] = doc
    ? withDeliveredImages(mergeDraftRows(slotRows(doc), drafts), entry)
    : []
  const picks = doc?.rep?.picks ?? []
  const confirmed = Boolean(doc?.rep?.confirmed)
  // 語を書き換えて当たらなくなった代表は数えない
  const liveCount = doc ? livePicks(doc).length : 0
  const notice = loading
    ? '読み込み中…'
    : state.saving
      ? '保存中…'
      : state.status
  const changed = doc ? changedSlots(doc, drafts) : []
  const dirty = changed.length > 0

  // 番号を移る・読み直す・閉じると下書きは消える。黙って捨てない
  const leave = (go: () => void) => {
    if (
      dirty &&
      !window.confirm('保存していない変更があります。破棄しますか？')
    )
      return false
    go()
    return true
  }

  const saveSlots = useCallback(
    (nextRows: SlotRow[], message: string) => {
      if (!doc) return
      send({ op: 'slots', slots: slotsFromRows(nextRows, doc) }, message)
    },
    [doc, send]
  )

  const editRow = useCallback((row: SlotRow, patch: Partial<SlotRow>) => {
    setDrafts((prev) => applyDraftEdit(prev, row, patch))
  }, [])

  const handleJump = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    setJump(digits)
    if (digits.length === 3 && digits !== num) {
      if (!leave(() => setNum(digits))) setJump(num)
    }
  }

  const step = (delta: number) => {
    const next = String((Number(num) + delta + 1000) % 1000).padStart(3, '0')
    leave(() => {
      setNum(next)
      setJump(next)
    })
  }

  /**
   * 語を別の番号へ付け替える。API は 1 番号 1 操作なので «移動先に足す → 移動元から抜く»
   * の順に送る (途中で落ちても語は消えない)。未保存の編集があると移動元の最終形が
   * 決まらないので、先に保存してもらう
   */
  const moveWord = async (row: SlotRow, to: string) => {
    if (!doc || state.saving) return
    if (dirty) {
      setState((prev) => ({
        ...prev,
        status: '未保存の変更を先に保存してください',
        failed: true,
      }))
      return
    }
    setState((prev) => ({ ...prev, saving: true, status: '' }))
    let added = false
    try {
      const target = await fetchNumber(to, token).catch((error) => {
        throw error instanceof Error && error.message === 'not_found'
          ? new Error(`${to} が見つかりません`)
          : error
      })
      const plan = planMove(doc, row, target)
      if (!plan.ok) throw new Error(plan.error)

      const saved = await patchNumber({
        num: to,
        token,
        op: { op: 'slots', slots: plan.targetSlots },
        expectedUpdatedAt: target.updatedAt ?? null,
      })
      added = true
      if (plan.rating) {
        await patchNumber({
          num: to,
          token,
          op: { op: 'rating', ...plan.rating },
          expectedUpdatedAt: saved.updatedAt ?? null,
        })
      }
      let source = await patchNumber({
        num: doc.num,
        token,
        op: { op: 'slots', slots: plan.sourceSlots },
        expectedUpdatedAt: doc.updatedAt ?? null,
      })
      if (plan.sourceRep) {
        source = await patchNumber({
          num: doc.num,
          token,
          op: { op: 'rep', ...plan.sourceRep },
          expectedUpdatedAt: source.updatedAt ?? null,
        })
      }
      setMoving(null)
      setState((prev) =>
        applySaved(prev, source, `「${row.word}」を ${to} に移しました`)
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setState((prev) =>
        applyFailure(
          prev,
          new Error(
            added
              ? `${to} には追加済み。${doc.num} から外せませんでした (${reason})。↻ で読み直してください`
              : reason
          )
        )
      )
    }
  }

  const addRow = useCallback(
    (family: SlotFamily) => {
      const slot = nextFreeSlot(rows, family)
      if (!slot) {
        setState((prev) => ({
          ...prev,
          status: '空き枠がありません (各 3 つまで)',
        }))
        return
      }
      setDrafts((prev) => ({
        ...prev,
        [slot]: {
          slot,
          word: '',
          kana: '',
          imageStale: false,
          rating: null,
          repRank: 0,
        },
      }))
    },
    [rows]
  )

  // 候補は優先順に下から積む (先頭が親指側)
  const main = doc ? (
    <ul class="nd-cards stack-up" style={{ '--stack-gap': '8px' }}>
      {rows.map((row, index) => (
        <SlotCard
          key={row.slot}
          row={row}
          index={index}
          num={doc.num}
          tables={tables}
          moveOpen={moving === row.slot}
          onToggleMove={() =>
            setMoving((prev) => (prev === row.slot ? null : row.slot))
          }
          onMove={(to) => moveWord(row, to)}
          focused={row.slot === focusSlot}
          saving={state.saving}
          isSaved={Boolean(doc.slots?.[row.slot])}
          changed={changed.includes(row.slot)}
          dragging={dragFrom === index}
          onDragStart={() => setDragFrom(index)}
          onDragEnd={() => setDragFrom(null)}
          onDropAt={() => {
            if (dragFrom === null || dragFrom === index) return
            saveSlots(
              moveItem(rows, dragFrom, index),
              dirty ? '並べ替え、未保存の変更も保存しました' : '並べ替えました'
            )
            setDragFrom(null)
          }}
          onEdit={(patch) => editRow(row, patch)}
          onDelete={() => {
            // 足しただけの枠は手元で消すだけ (サーバに送るものが無い)
            if (!doc.slots?.[row.slot]) {
              setDrafts(({ [row.slot]: _, ...rest }) => rest)
              return
            }
            // slots は最終形を送るので、他の枠の未保存の編集も一緒に保存される
            saveSlots(
              rows.filter((other) => other.slot !== row.slot),
              dirty ? '削除し、未保存の変更も保存しました' : '削除しました'
            )
          }}
          onPickRep={(rank) => {
            const op = repPickOp(doc, row.slot, rank)
            send(op, op.confirmed ? '代表を確定しました' : '代表を外しました')
          }}
          onRate={(value) =>
            send(
              {
                op: 'rating',
                k: row.kana,
                w: row.word,
                v: nextRatingValue(row.rating, value),
              },
              '評価を保存しました'
            )
          }
        />
      ))}
    </ul>
  ) : null

  const dock = (
    <div class="nd-dock">
      {/* 編集欄の間に差し込むと出るたびに行がずれるので、dock の真上に重ねて出す */}
      <p
        class={
          'nd-status' +
          (notice ? ' show' : '') +
          (state.failed && !state.saving && !loading ? ' error' : '')
        }
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
      <DockBar>
        <button class="nd-step" onClick={() => step(-1)} aria-label="前の番号">
          −
        </button>
        <input
          class="nd-jump"
          inputMode="numeric"
          pattern="[0-9]*"
          value={jump}
          onInput={(event) => handleJump(event.currentTarget.value)}
        />
        <button class="nd-step" onClick={() => step(1)} aria-label="次の番号">
          ＋
        </button>
        {/* 番号送り (− ＋) と同じ箱にすると見分けがつかないので、枠なしで置く */}
        <button
          class="nd-ghost nd-reload"
          onClick={() => leave(() => load(num))}
          aria-label="読み直す"
          title="読み直す"
        >
          ↻
        </button>
        {onClose ? (
          <QuitButton label="閉じる" onClick={() => leave(onClose)} />
        ) : null}
      </DockBar>
      {doc ? (
        <>
          {/* 代表の状態はここ 1 か所にまとめる。候補の保存とは別の操作。
              状態 (バッジ) と操作 (ボタン) を分ける。ボタン 1 つの文言と色で
              両方を表すと、押した直後にどちらの状態なのか読み取れない */}
          <section
            class={'nd-rep' + (confirmed ? ' on' : '')}
            aria-label="代表"
          >
            <span class={'nd-rep-state' + (confirmed ? ' on' : '')}>
              {confirmed ? '✓ 確定' : '未確定'}
            </span>
            {REP_RANKS.map((rank) => {
              const pick = picks[rank - 1]
              return (
                <span key={rank} class={'nd-rep-pick' + (pick ? '' : ' none')}>
                  {REP_LABEL[rank]} {pick ? pick.w : '—'}
                </span>
              )
            })}
            <button
              class={'nd-rep-btn' + (confirmed ? ' undo' : '')}
              disabled={state.saving || (!confirmed && liveCount === 0)}
              title={
                !confirmed && liveCount === 0
                  ? '候補の ①② で代表を選ぶと確定します'
                  : undefined
              }
              onClick={() =>
                send(
                  { op: 'rep', picks, confirmed: !confirmed },
                  confirmed ? '代表の確定を外しました' : '代表を確定しました'
                )
              }
            >
              {state.saving ? '保存中…' : confirmed ? '確定を外す' : '確定する'}
            </button>
          </section>
          {/* 追加と保存を 1 行にまとめる。未保存バーを別の行で出し入れすると、
              dock の高さが変わって画面全体が上下に揺れる */}
          <div class="nd-editrow">
            <button
              class="nd-add"
              onClick={() => addRow('wh')}
              disabled={state.saving || !nextFreeSlot(rows, 'wh')}
            >
              ＋ 人
            </button>
            <button
              class="nd-add"
              onClick={() => addRow('wm')}
              disabled={state.saving || !nextFreeSlot(rows, 'wm')}
            >
              ＋ 物
            </button>
            {dirty ? (
              <>
                <span
                  class="nd-dirty"
                  role="status"
                  aria-label={`未保存の変更 ${changed.length} 件`}
                >
                  ● 未保存 {changed.length}
                </span>
                <button
                  class="nd-ghost"
                  disabled={state.saving}
                  onClick={() => setDrafts({})}
                >
                  戻す
                </button>
                <button
                  class="nd-save"
                  disabled={state.saving}
                  onClick={() => saveSlots(rows, '保存しました')}
                >
                  保存
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )

  return <Screen main={main} dock={dock} />
}

function SlotCard({
  row,
  index,
  num,
  tables,
  moveOpen,
  onToggleMove,
  onMove,
  focused,
  saving,
  isSaved,
  changed,
  dragging,
  onDragStart,
  onDragEnd,
  onDropAt,
  onEdit,
  onDelete,
  onPickRep,
  onRate,
}: {
  row: SlotRow
  index: number
  /** この画面の番号。かながその読みになっているかを見る */
  num: string
  tables: ReadingTables | null
  moveOpen: boolean
  onToggleMove: () => void
  onMove: (to: string) => void
  focused: boolean
  saving: boolean
  /** サーバに保存済みの枠か。追加しただけの候補は代表・評価の対象にできない */
  isSaved: boolean
  /** 保存済みの内容から書き換えた (または新しく足した) 枠 */
  changed: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropAt: () => void
  onEdit: (patch: Partial<SlotRow>) => void
  onDelete: () => void
  onPickRep: (rank: 1 | 2) => void
  onRate: (value: number) => void
}) {
  // 書き換え中・足しただけの枠は、代表と評価を付ける相手 (保存された語) と
  // 画面の語がずれている。押せない飾りを並べず、保存が先だと書く
  const pending = !isSaved || changed
  // 入力中もその場で判定する。打ったかながどの番号の読みかが分かる
  const check: ReadingCheck | null = tables
    ? checkReading(tables, row.kana, num)
    : null
  const suspicious =
    check?.status === 'mismatch' || check?.status === 'unreadable'
  const canMove = !pending && !saving
  return (
    <li
      class={
        'nd-card' +
        (row.repRank && !pending ? ' rep' : '') +
        (pending ? ' draft' : '') +
        (dragging ? ' dragging' : '')
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropAt}
    >
      <div class="nd-card-head">
        {/* ハンドルだけ draggable。カード全体だと入力欄を選択できなくなる */}
        <span
          class="nd-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="ドラッグで優先順位を変える"
        >
          ⠿
        </span>
        <span class="nd-slot">
          {row.slot}
          {pending ? (
            <span class="nd-draft-tag">{isSaved ? '未保存' : '新規'}</span>
          ) : null}
          {/* 読みルールで別の番号になるかなは目印を出す。押すと移動欄を開く */}
          {suspicious ? (
            <button
              class="nd-read-warn"
              disabled={!canMove}
              onClick={onToggleMove}
              title={
                check?.status === 'mismatch'
                  ? `読みルールでは ${check.suggest[0]}`
                  : '読みルールに無いかなを含む'
              }
            >
              ⚠{check?.status === 'mismatch' ? check.suggest[0] : '?'}
            </button>
          ) : null}
        </span>
        {row.imageUrl ? (
          <img
            class={'nd-img' + (row.imageStale ? ' stale' : '')}
            loading="lazy"
            src={row.imageUrl}
            alt={row.word}
            title={row.imageStale ? '確定時点の語と違う画像' : undefined}
          />
        ) : (
          <span class="nd-img empty" />
        )}
        <div class="nd-fields">
          <input
            class="nd-input"
            value={row.word}
            placeholder="語"
            autoFocus={focused}
            onInput={(event) => onEdit({ word: event.currentTarget.value })}
          />
          <input
            class="nd-input kana"
            value={row.kana}
            placeholder="よみ"
            onInput={(event) => onEdit({ kana: event.currentTarget.value })}
          />
        </div>
        <button
          class={'nd-del nd-move-btn' + (moveOpen ? ' on' : '')}
          disabled={!canMove}
          onClick={onToggleMove}
          aria-expanded={moveOpen}
          title={pending ? '保存してから移せます' : '別の番号へ移す'}
        >
          ⇄
        </button>
        <button
          class="nd-del"
          disabled={saving}
          onClick={onDelete}
          title="この候補を削除"
        >
          ×
        </button>
      </div>
      {moveOpen ? (
        <MovePanel
          num={num}
          kana={row.kana}
          tables={tables}
          saving={saving}
          onMove={onMove}
          onCancel={onToggleMove}
        />
      ) : null}

      <div class="nd-card-foot">
        {row.rankey && !pending ? <Rankey value={row.rankey} /> : null}
        {row.pt != null && !pending ? (
          <span class="nd-pt">{row.pt.toFixed(1)}</span>
        ) : null}
        {pending ? (
          <span class="nd-pending-note">
            保存すると代表・評価を付けられます
          </span>
        ) : (
          <>
            <div class="nd-rank-group" role="group" aria-label="代表">
              {REP_RANKS.map((rank) => (
                <button
                  key={rank}
                  class={'nd-rank' + (row.repRank === rank ? ' on' : '')}
                  disabled={saving || !row.word}
                  aria-pressed={row.repRank === rank}
                  onClick={() => onPickRep(rank)}
                  title={`代表${REP_LABEL[rank]}にする / 外す`}
                >
                  {REP_LABEL[rank]}
                </button>
              ))}
            </div>
            <div class="nd-rate">
              {RATING_VALUES.map((value) => (
                <button
                  key={value}
                  class={'nd-rate-btn' + (row.rating === value ? ' on' : '')}
                  disabled={saving || !row.word}
                  onClick={() => onRate(value)}
                >
                  {RATING_LABEL[value]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * 別の番号へ移す欄。読みルールで読んだ番号 (と中間省略で読める番号) を候補に出し、
 * 押せばその番号が入る。手で打ってもよい
 */
function MovePanel({
  num,
  kana,
  tables,
  saving,
  onMove,
  onCancel,
}: {
  num: string
  kana: string
  tables: ReadingTables | null
  saving: boolean
  onMove: (to: string) => void
  onCancel: () => void
}) {
  const reading = tables ? readingOf(tables, kana) : { num: null, omitted: [] }
  const suggestions = [
    ...(reading.num ? [{ num: reading.num, label: '読み' }] : []),
    ...reading.omitted.map((n) => ({ num: n, label: '省略' })),
  ].filter((item) => item.num !== num)
  const [to, setTo] = useState(suggestions[0]?.num ?? '')
  const valid = /^\d{3}$/.test(to) && to !== num

  return (
    <div class="nd-move" role="group" aria-label="別の番号へ移す">
      <div class="nd-move-row">
        <span class="nd-move-label">移動先</span>
        <input
          class="nd-move-input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={to}
          onInput={(event) =>
            setTo(event.currentTarget.value.replace(/\D/g, '').slice(0, 3))
          }
        />
        <button
          class="nd-save"
          disabled={saving || !valid}
          onClick={() => onMove(to)}
        >
          移す
        </button>
        <button class="nd-ghost" onClick={onCancel}>
          やめる
        </button>
      </div>
      {suggestions.length ? (
        <div class="nd-move-row">
          <span class="nd-move-label">候補</span>
          {suggestions.map((item) => (
            <button
              key={item.num}
              class={'nd-move-chip' + (to === item.num ? ' on' : '')}
              onClick={() => setTo(item.num)}
            >
              {item.num}
              <small>{item.label}</small>
            </button>
          ))}
        </div>
      ) : (
        <p class="nd-move-note">
          {reading.num === num
            ? 'このかなはこの番号の読みです'
            : '読みルールから番号を出せないかなです'}
        </p>
      )}
    </div>
  )
}
