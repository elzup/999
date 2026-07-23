import { useEffect, useRef, useState } from 'preact/hooks'
import { vibrate } from '../lib/haptics'
import type { QuizSummary } from './ChoiceQuiz'
import type { ReviewItem } from './ReviewPanel'
import {
  BINARY_DIGITS_PER_ROW as COLS,
  chunkRows,
  scoreBinary,
} from '../lib/binaryTest'

type Props = {
  title: string
  memoSec: number
  recallSec: number
  rows: string[] // 正解グリッド(呼び出し側で生成)
  onQuit: () => void
  onComplete: (summary: QuizSummary) => void
}

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
const CURSOR_BITS = 8 // ハイライトカーソルの刻み(8bit=1バイト)
const NIBBLE = 4 // 色分けの単位(4bit)
const CELL_W = 11 // 1桁セルの固定幅(記憶・回答で列を縦に揃える)
// 4bitごとの色(偶数ニブル/奇数ニブル)。8bitを hex 2桁として読めるように。
const NIBBLE_COLOR = ['var(--text)', 'var(--blue, #60a5fa)']

// 8bit を hex 2桁に。端数(<8)は空文字。
function bitsToHex(bits: string): string {
  if (bits.length !== CURSOR_BITS) return ''
  return parseInt(bits, 2).toString(16).toUpperCase().padStart(2, '0')
}

// 30桁を3桁ずつ区切って表示(採点結果・確定行の視認性)。
function groupBits(bits: string): string {
  return bits.replace(/(.{3})/g, '$1 ').trimEnd()
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildReviews(userRows: string[], correctRows: string[]): ReviewItem[] {
  const { rows } = scoreBinary(userRows, correctRows)
  return rows
    .filter((r) => r.attempted > 0)
    .map((r) => ({
      label: `${r.index + 1}行目 (${r.points}pt)`,
      correct: r.errors === 0,
      userAnswer: groupBits(r.userRow),
      rightAnswer: groupBits(r.correctRow),
    }))
}

// 記憶フェーズ: 1行30bitのグリッド(30桁は維持)。全体を連続ストリームとして
// 4bit(ニブル)で色分けし、8bit(1バイト)刻みのカーソルで読む位置を送る。
// 30は8で割り切れないのでバイトは行末で改行をまたぐ(端数は最終バイトのみ)。
function MemoView({
  rows,
  remain,
  onQuit,
  onEnd,
}: {
  rows: string[]
  remain: number
  onQuit: () => void
  onEnd: () => void
}) {
  const allBits = rows.join('')
  const totalBits = allBits.length
  const byteCount = Math.ceil(totalBits / CURSOR_BITS)
  const [cursor, setCursor] = useState(0) // バイト番号(連続)
  const byteStart = cursor * CURSOR_BITS
  const byteEnd = Math.min(byteStart + CURSOR_BITS, totalBits)
  const curRow = Math.floor(byteStart / COLS)
  const curHex = bitsToHex(allBits.slice(byteStart, byteEnd))
  const rowRef = useRef<HTMLDivElement | null>(null)

  // カーソル(バイト先頭)の行を表示領域内に保つ。
  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: 'center' })
  }, [curRow])

  const move = (d: number) =>
    setCursor((c) => Math.max(0, Math.min(byteCount - 1, c + d)))

  return (
    <div
      class="test-screen quiz-screen"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            class="filter-btn"
            style={{ fontSize: 12, padding: '4px 8px' }}
            onClick={onQuit}
          >
            やめる
          </button>
          <span
            style={{
              ...mono,
              fontSize: 16,
              fontWeight: 700,
              color: remain <= 30 ? 'var(--red, #f87171)' : 'var(--accent)',
            }}
          >
            {mmss(remain)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {rows.length}行 記憶
          </span>
        </div>
      </div>

      <div class="content" style={{ overflow: 'auto', padding: '8px 10px' }}>
        {rows.map((bits, i) => (
          <div
            key={i}
            ref={i === curRow ? rowRef : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 0',
              borderBottom: '1px solid var(--line, rgba(255,255,255,.06))',
            }}
          >
            <span
              style={{
                ...mono,
                width: 20,
                color: 'var(--text2)',
                fontSize: 11,
              }}
            >
              {i + 1}
            </span>
            <span style={{ display: 'flex' }}>
              {Array.from({ length: COLS }, (_, col) => {
                const a = i * COLS + col // 連続ビット位置
                const hl = a >= byteStart && a < byteEnd
                return (
                  <span
                    key={col}
                    onClick={() => setCursor(Math.floor(a / CURSOR_BITS))}
                    style={{
                      ...mono,
                      fontSize: 16,
                      fontWeight: 600,
                      width: CELL_W,
                      textAlign: 'center',
                      cursor: 'pointer',
                      color: NIBBLE_COLOR[Math.floor(a / NIBBLE) % 2],
                      background: hl
                        ? 'color-mix(in srgb, var(--accent) 24%, transparent)'
                        : 'transparent',
                      borderTop: hl
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                      borderBottom: hl
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                    }}
                  >
                    {bits[col]}
                  </span>
                )
              })}
            </span>
          </div>
        ))}
      </div>

      {/* カーソル送り(8bit=1バイトずつ) + 記憶終了 */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '10px 12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            class="filter-btn"
            style={{ flex: 1, padding: '16px 0', fontSize: 20 }}
            disabled={cursor <= 0}
            onClick={() => move(-1)}
          >
            ◀
          </button>
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 86,
            }}
          >
            <span style={{ ...mono, fontSize: 20, fontWeight: 700 }}>
              {curHex || '端数'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>
              {cursor + 1}/{byteCount} バイト
            </span>
          </span>
          <button
            class="filter-btn"
            style={{ flex: 1, padding: '16px 0', fontSize: 20 }}
            disabled={cursor >= byteCount - 1}
            onClick={() => move(1)}
          >
            ▶
          </button>
        </div>
        <button
          class="filter-btn"
          style={{ padding: '10px 0', fontWeight: 700 }}
          onClick={onEnd}
        >
          記憶終了→回答
        </button>
      </div>
    </div>
  )
}

function BinaryTest({
  title,
  memoSec,
  recallSec,
  rows,
  onQuit,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'memo' | 'recall'>('memo')
  const [remain, setRemain] = useState(memoSec)
  const [remainR, setRemainR] = useState(recallSec)
  const [entered, setEntered] = useState('')
  const enteredRef = useRef('')
  const memoUsedRef = useRef(memoSec)
  const doneRef = useRef(false)
  const total = rows.length * COLS

  const finish = (nextEntered: string) => {
    if (doneRef.current) return
    doneRef.current = true
    const userRows = chunkRows(nextEntered)
    const { points } = scoreBinary(userRows, rows)
    onComplete({
      score: points,
      total,
      time: memoUsedRef.current,
      reviews: buildReviews(userRows, rows),
    })
  }

  // 記憶フェーズのカウントダウン。0で自動的に回答へ。
  useEffect(() => {
    if (phase !== 'memo') return
    if (remain <= 0) {
      memoUsedRef.current = memoSec
      setPhase('recall')
      return
    }
    const t = setTimeout(() => setRemain((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, remain, memoSec])

  // 回答フェーズの制限時間。0で自動採点。
  useEffect(() => {
    if (phase !== 'recall') return
    if (remainR <= 0) {
      finish(enteredRef.current)
      return
    }
    const t = setTimeout(() => setRemainR((r) => r - 1), 1000)
    return () => clearTimeout(t)
    // finish は doneRef ガード済み。remainR/phase の変化で回す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remainR])

  // 回答中の現在行を表示領域内に保つ。
  const recallRowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (phase !== 'recall') return
    recallRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [phase, entered.length])

  const endMemo = () => {
    memoUsedRef.current = memoSec - remain
    setPhase('recall')
  }

  const setEnteredBoth = (next: string) => {
    enteredRef.current = next
    setEntered(next)
  }

  const press = (k: string) => {
    if (entered.length >= total) return
    const next = entered + k
    vibrate()
    setEnteredBoth(next)
    if (next.length >= total) finish(next)
  }

  const backspace = () => setEnteredBoth(entered.slice(0, -1))

  if (phase === 'memo') {
    return (
      <MemoView rows={rows} remain={remain} onQuit={onQuit} onEnd={endMemo} />
    )
  }

  // 回答フェーズ: 記憶と同じ揃ったグリッド(30列均等)を全行表示し、左上から埋める。
  const enteredRows = chunkRows(entered)
  const curRow = Math.min(Math.floor(entered.length / COLS), rows.length - 1)
  const curCol = entered.length - curRow * COLS

  return (
    <div
      class="test-screen quiz-screen"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div class="pi-header-title">{title} 回答</div>
          <span
            style={{
              ...mono,
              fontSize: 15,
              fontWeight: 700,
              color: remainR <= 30 ? 'var(--red, #f87171)' : 'var(--accent)',
            }}
          >
            {mmss(remainR)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {curRow + 1}/{rows.length}行 {curCol}/{COLS}
          </span>
          <button
            class="filter-btn"
            style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}
            onClick={() => finish(entered)}
          >
            終了して採点
          </button>
        </div>
      </div>

      <div
        class="content"
        style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}
      >
        {rows.map((_, i) => {
          const bits = enteredRows[i] ?? ''
          const isCurRow = i === curRow
          return (
            <div
              key={i}
              ref={isCurRow ? recallRowRef : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 0',
                borderBottom: '1px solid var(--line, rgba(255,255,255,.06))',
                background: isCurRow
                  ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                  : 'transparent',
              }}
            >
              <span
                style={{
                  ...mono,
                  width: 20,
                  color: 'var(--text2)',
                  fontSize: 11,
                }}
              >
                {i + 1}
              </span>
              <span style={{ display: 'flex' }}>
                {Array.from({ length: COLS }, (_, col) => {
                  const ch = bits[col]
                  const isCaret = isCurRow && col === curCol
                  return (
                    <span
                      key={col}
                      style={{
                        ...mono,
                        fontSize: 16,
                        fontWeight: 600,
                        width: CELL_W,
                        textAlign: 'center',
                        color: ch
                          ? 'var(--text)'
                          : isCaret
                          ? 'var(--accent)'
                          : 'var(--muted, #6b7280)',
                        borderBottom: isCaret
                          ? '2px solid var(--accent)'
                          : '2px solid transparent',
                      }}
                    >
                      {ch ?? '·'}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>

      {/* 0/1 キーパッド(画面下部固定) */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '10px 12px 14px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            width: '100%',
            maxWidth: 320,
            margin: '0 auto',
          }}
        >
          {['0', '1'].map((k) => (
            <button
              key={k}
              disabled={entered.length >= total}
              onClick={() => press(k)}
              style={{
                padding: '24px 0',
                fontSize: 26,
                fontWeight: 700,
                ...mono,
                borderRadius: 12,
                border: '1.5px solid var(--line, rgba(255,255,255,.12))',
                background: 'var(--surface2, #1e212a)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {k}
            </button>
          ))}
          <button
            disabled={entered.length === 0}
            onClick={backspace}
            style={{
              gridColumn: 'span 2',
              padding: '12px 0',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
              border: '1.5px solid var(--line, rgba(255,255,255,.12))',
              background: 'transparent',
              color: 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            ⌫ 消す
          </button>
        </div>
      </div>
    </div>
  )
}

export default BinaryTest
