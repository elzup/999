// 番号単位の統合ビュー。
// spec: .vsdd/firestore-store/specs/spec-number-detail-view.md
// UI 案: .metarc/editor-ui-drafts-v2.html の A-2 (カード型) + B-1 (⠿ ドラッグ)
//
// 4 つの面 (シート / 編集画面 / 代表語コンソール / 画像コンソール) に散っていた
// 操作を 1 番号ぶんの 1 画面に集める。読み書きは numbers/{num} だけを見る。

import { useCallback, useEffect, useState } from 'preact/hooks'
import { fetchNumber, patchNumber, type PatchOp } from '../lib/numberApi'
import {
  applyFailure,
  applySaved,
  freeSlotFamily,
  moveItem,
  nextRatingValue,
  RATING_VALUES,
  slotRows,
  slotsFromRows,
  toggleRepPick,
  type DetailState,
  type SlotRow,
} from '../lib/numberDetail'
import Rankey from './Rankey'

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
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const load = useCallback(
    (target: string) => {
      if (!token) return
      setLoading(true)
      setDrafts({})
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
        setDrafts({})
        setState((prev) => applySaved(prev, saved, message))
      } catch (error) {
        setState((prev) => applyFailure(prev, error))
      }
    },
    [state.doc, state.saving, token]
  )

  const doc = state.doc
  // 表示行 = 保存済みの内容に、未保存の編集を重ねたもの
  const rows: SlotRow[] = doc
    ? slotRows(doc).map((row) => drafts[row.slot] ?? row)
    : []
  const picks = doc?.rep?.picks ?? []
  const dirty = Object.keys(drafts).length > 0

  const saveSlots = useCallback(
    (nextRows: SlotRow[], message: string) => {
      if (!doc) return
      send({ op: 'slots', slots: slotsFromRows(nextRows, doc) }, message)
    },
    [doc, send]
  )

  const editRow = useCallback((slot: string, patch: Partial<SlotRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] as SlotRow), ...patch },
    }))
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

  const addRow = useCallback(() => {
    const family = freeSlotFamily(rows)
    if (!family) {
      setState((prev) => ({
        ...prev,
        status: '空き枠がありません (各 3 つまで)',
      }))
      return
    }
    const slot = `${family}${
      rows.filter((r) => r.slot.startsWith(family)).length + 1
    }`
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
  }, [rows])

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
                key={row.slot}
                row={row}
                index={index}
                focused={row.slot === focusSlot}
                saving={state.saving}
                dragging={dragFrom === index}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDropAt={() => {
                  if (dragFrom === null || dragFrom === index) return
                  saveSlots(moveItem(rows, dragFrom, index), '並べ替えました')
                  setDragFrom(null)
                }}
                onEdit={(patch) => editRow(row.slot, patch)}
                onDelete={() =>
                  saveSlots(
                    rows.filter((other) => other.slot !== row.slot),
                    '削除しました'
                  )
                }
                onToggleRep={() =>
                  send(
                    {
                      op: 'rep',
                      picks: toggleRepPick(doc, row.slot),
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
            <button class="nd-add" onClick={addRow} disabled={state.saving}>
              ＋ 候補を追加
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
  dragging,
  onDragStart,
  onDragEnd,
  onDropAt,
  onEdit,
  onDelete,
  onToggleRep,
  onRate,
}: {
  row: SlotRow
  index: number
  focused: boolean
  saving: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropAt: () => void
  onEdit: (patch: Partial<SlotRow>) => void
  onDelete: () => void
  onToggleRep: () => void
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
        <button
          class={'nd-rank' + (row.repRank ? ' on' : '')}
          disabled={saving}
          onClick={onToggleRep}
          title="代表にする / 外す"
        >
          {row.repRank === 1 ? '①' : row.repRank === 2 ? '②' : '–'}
        </button>
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
        {row.rankey ? <Rankey value={row.rankey} /> : null}
        {row.pt != null ? <span class="nd-pt">{row.pt.toFixed(1)}</span> : null}
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
      </div>
    </li>
  )
}
