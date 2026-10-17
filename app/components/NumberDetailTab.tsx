// 番号単位の統合ビュー。
// spec: .vsdd/firestore-store/specs/spec-number-detail-view.md
// UI 案: .metarc/editor-ui-drafts-v2.html の A-2 (カード型) + B-1 (⠿ ドラッグ)
//
// 4 つの面 (シート / 編集画面 / 代表語コンソール / 画像コンソール) に散っていた
// 操作を 1 番号ぶんの 1 画面に集める。読み書きは numbers/{num} だけを見る。

import { useCallback, useEffect, useState } from 'preact/hooks'
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
  RATING_VALUES,
  repPickOp,
  slotRows,
  slotsFromRows,
  type DetailState,
  type SlotRow,
  withDeliveredImages,
} from '../lib/numberDetail'
import type { NumberEntry } from '../data/schema'
import Rankey from './Rankey'
import Screen, { DockBar, DockRow, QuitButton } from './Screen'

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
  onClose,
}: {
  token: string
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

  const load = useCallback(
    (target: string) => {
      if (!token) return
      setLoading(true)
      setDrafts({})
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
          {/* 代表の状態はここ 1 か所にまとめる。候補の保存とは別の操作 */}
          <section class="nd-rep" aria-label="代表">
            <span class="nd-rep-label">代表</span>
            {REP_RANKS.map((rank) => {
              const pick = picks[rank - 1]
              return (
                <span key={rank} class={'nd-rep-pick' + (pick ? '' : ' none')}>
                  {REP_LABEL[rank]} {pick ? pick.w : '—'}
                </span>
              )
            })}
            <button
              class={'nd-rep-btn' + (confirmed ? ' on' : '')}
              disabled={state.saving || (!confirmed && liveCount === 0)}
              aria-pressed={confirmed}
              title={
                confirmed
                  ? '押すと代表の確定を外す'
                  : liveCount === 0
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
              {confirmed ? '✓ 代表確定済み' : '代表を確定'}
            </button>
          </section>
          <DockRow>
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
          </DockRow>
          {/* 未保存があるあいだは dock に出し続ける。dock は常に見えている */}
          {dirty ? (
            <div class="nd-savebar" role="region" aria-label="未保存の変更">
              <span class="nd-savebar-text">
                ● 未保存の変更 {changed.length} 件
              </span>
              <button
                class="nd-ghost"
                disabled={state.saving}
                onClick={() => setDrafts({})}
              >
                元に戻す
              </button>
              <button
                class="nd-save"
                disabled={state.saving}
                onClick={() => saveSlots(rows, '保存しました')}
              >
                保存
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )

  return <Screen main={main} dock={dock} />
}

function SlotCard({
  row,
  index,
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
          class="nd-del"
          disabled={saving}
          onClick={onDelete}
          title="この候補を削除"
        >
          ×
        </button>
      </div>

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
