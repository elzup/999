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
  nextFreeSlot,
  type SlotFamily,
  mergeDraftRows,
  moveItem,
  nextRatingValue,
  RATING_VALUES,
  slotRows,
  slotsFromRows,
  setRepPick,
  type DetailState,
  type SlotRow,
} from '../lib/numberDetail'
import Rankey from './Rankey'

const REP_RANKS = [1, 2] as const
const REP_LABEL: Record<1 | 2, string> = { 1: '①', 2: '②' }

const RATING_LABEL: Record<number, string> = {
  [-1]: '−1',
  [0]: '0',
  [1]: '+1',
  [2]: '+2',
}

const EMPTY: DetailState = { doc: null, status: '', saving: false }

export default function NumberDetailTab({
  token,
  initialNum = '000',
  focusSlot,
  onClose,
}: {
  token: string
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
  // 下書きを捨てた回数。入力欄は打った文字を画面側に持たせる (非制御) ので、
  // 下書きを捨てたときはカードを作り直して保存済みの値を入れ直す
  const [resetSeq, setResetSeq] = useState(0)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const load = useCallback(
    (target: string) => {
      if (!token) return
      setLoading(true)
      setDrafts({})
      setResetSeq((n) => n + 1)
      fetchNumber(target, token)
        .then((doc) => setState({ doc, status: '', saving: false }))
        .catch((error) =>
          setState({ doc: null, status: String(error.message), saving: false })
        )
        .finally(() => setLoading(false))
    },
    [token]
  )

  useEffect(() => load(num), [num, load])

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
        if (op.op === 'slots') {
          setDrafts({})
          setResetSeq((n) => n + 1)
        }
        setState((prev) => applySaved(prev, saved, message))
      } catch (error) {
        setState((prev) => applyFailure(prev, error))
      }
    },
    [state.doc, state.saving, token]
  )

  const doc = state.doc
  // 表示行 = 保存済みの内容に、未保存の編集を重ねたもの
  const rows: SlotRow[] = doc ? mergeDraftRows(slotRows(doc), drafts) : []
  const picks = doc?.rep?.picks ?? []
  const dirty = Object.keys(drafts).length > 0

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

  const handleJump = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    setJump(digits)
    if (digits.length === 3) setNum(digits)
  }, [])

  const step = useCallback(
    (delta: number) => {
      const next = String((Number(num) + delta + 1000) % 1000).padStart(3, '0')
      setNum(next)
      setJump(next)
    },
    [num]
  )

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

  return (
    <main class="content nd-panel">
      <div class="nd-bar">
        {onClose ? (
          <button class="nd-step" onClick={onClose} aria-label="閉じる">
            ‹
          </button>
        ) : null}
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
        <button class="nd-reload" onClick={() => load(num)}>
          読み直す
        </button>
      </div>

      {state.status ? <p class="nd-status">{state.status}</p> : null}
      {loading ? <p class="nd-status">読み込み中…</p> : null}

      {doc ? (
        <>
          <ul class="nd-cards">
            {rows.map((row, index) => (
              <SlotCard
                key={`${row.slot}:${resetSeq}`}
                row={row}
                index={index}
                focused={row.slot === focusSlot}
                saving={state.saving}
                isSaved={Boolean(doc.slots?.[row.slot])}
                dragging={dragFrom === index}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDropAt={() => {
                  if (dragFrom === null || dragFrom === index) return
                  saveSlots(moveItem(rows, dragFrom, index), '並べ替えました')
                  setDragFrom(null)
                }}
                onEdit={(patch) => editRow(row, patch)}
                onDelete={() =>
                  saveSlots(
                    rows.filter((other) => other.slot !== row.slot),
                    '削除しました'
                  )
                }
                onPickRep={(rank) =>
                  send(
                    {
                      op: 'rep',
                      picks: setRepPick(doc, row.slot, rank),
                      confirmed: Boolean(doc.rep?.confirmed),
                    },
                    '代表を変更しました'
                  )
                }
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

          <div class="nd-actions">
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
              <button
                class="nd-save"
                disabled={state.saving}
                onClick={() => saveSlots(rows, '保存しました')}
              >
                変更を保存
              </button>
            ) : null}
          </div>

          <div class="nd-rep">
            <span class="nd-rep-label">
              代表 {picks.length}/2 {doc.rep?.confirmed ? '· 確定済み' : ''}
            </span>
            <button
              class={'nd-rep-btn' + (doc.rep?.confirmed ? ' on' : '')}
              disabled={state.saving}
              onClick={() =>
                send(
                  { op: 'rep', picks, confirmed: !doc.rep?.confirmed },
                  doc.rep?.confirmed ? '確定を外しました' : '確定しました'
                )
              }
            >
              確定
            </button>
          </div>
        </>
      ) : null}
    </main>
  )
}

function SlotCard({
  row,
  index,
  focused,
  saving,
  isSaved,
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
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropAt: () => void
  onEdit: (patch: Partial<SlotRow>) => void
  onDelete: () => void
  onPickRep: (rank: 1 | 2) => void
  onRate: (value: number) => void
}) {
  return (
    <li
      class={
        'nd-card' + (row.repRank ? ' rep' : '') + (dragging ? ' dragging' : '')
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
        <span class="nd-slot">{row.slot}</span>
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
        {/* value で縛ると、入力のたびの再描画がスマホの日本語入力 (変換中の文字) と
            ぶつかって打てなくなることがある。文字は入力欄に任せ、onInput で下書きにだけ写す */}
        <div class="nd-fields">
          <input
            class="nd-input"
            defaultValue={row.word}
            placeholder="語"
            autoFocus={focused}
            onInput={(event) => onEdit({ word: event.currentTarget.value })}
          />
          <input
            class="nd-input kana"
            defaultValue={row.kana}
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
        {row.rankey ? <Rankey value={row.rankey} /> : null}
        {row.pt != null ? <span class="nd-pt">{row.pt.toFixed(1)}</span> : null}
        <div class="nd-rank-group" role="group" aria-label="代表">
          {REP_RANKS.map((rank) => (
            <button
              key={rank}
              class={'nd-rank' + (row.repRank === rank ? ' on' : '')}
              disabled={saving || !isSaved || !row.word}
              aria-pressed={row.repRank === rank}
              onClick={() => onPickRep(rank)}
              title={
                isSaved
                  ? `代表${REP_LABEL[rank]}にする / 外す`
                  : '保存してから代表にできます'
              }
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
              disabled={saving || !row.word || !isSaved}
              onClick={() => onRate(value)}
            >
              {RATING_LABEL[value]}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
