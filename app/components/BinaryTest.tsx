import { useEffect, useRef, useState } from 'preact/hooks'
import type { QuizSummary } from './ChoiceQuiz'
import Screen, { DockBar, DockRow, QuitButton } from './Screen'
import TestPad from './TestPad'
import type { ReviewItem } from './ReviewPanel'
import {
  BINARY_DIGITS_PER_ROW as COLS,
  byteDiff,
  byteToHex,
  chunkRows,
  scoreBinary,
  type ByteDiffCell,
} from '../lib/binaryTest'

type Props = {
  title: string
  memoSec: number
  recallSec: number
  rows: string[] // 正解グリッド(呼び出し側で生成)
  highlight: boolean // 記憶時に8bitカーソルのハイライトを出すか
  onQuit: () => void
  onComplete: (summary: QuizSummary) => void
}

const mono = { fontFamily: 'var(--font-mono)' }
const CURSOR_BITS = 8 // ハイライトカーソルの刻み(8bit=1バイト)
const NIBBLE = 4 // 色分けの単位(4bit)
const CELL_W = 11 // 1桁セルの固定幅(記憶・回答で列を縦に揃える)
// 4bitごとの色(偶数ニブル/奇数ニブル)。8bitを hex 2桁として読めるように。
const NIBBLE_COLOR = ['var(--text)', 'var(--blue, #60a5fa)']

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
  highlight,
  onQuit,
  onEnd,
}: {
  rows: string[]
  remain: number
  highlight: boolean
  onQuit: () => void
  onEnd: () => void
}) {
  const allBits = rows.join('')
  const totalBits = allBits.length
  const byteCount = Math.ceil(totalBits / CURSOR_BITS)
  const [cursor, setCursor] = useState(0) // バイト番号(連続)
  const byteStart = cursor * CURSOR_BITS
  const byteEnd = Math.min(byteStart + CURSOR_BITS, totalBits)
  const curRow = highlight ? Math.floor(byteStart / COLS) : -1
  const curHex = byteToHex(allBits.slice(byteStart, byteEnd)) ?? ''
  const rowRef = useRef<HTMLDivElement | null>(null)

  // カーソル(バイト先頭)の行を表示領域内に保つ。
  useEffect(() => {
    if (highlight) rowRef.current?.scrollIntoView({ block: 'center' })
  }, [curRow, highlight])

  const move = (d: number) =>
    setCursor((c) => Math.max(0, Math.min(byteCount - 1, c + d)))

  // 矢印キーでもカーソルを動かせる(←→で1バイト, ↑↓で約1行=4バイト)。
  const rowStep = Math.ceil(COLS / CURSOR_BITS)
  useEffect(() => {
    if (!highlight) return
    const onKey = (e: KeyboardEvent) => {
      const step =
        e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowLeft'
          ? -1
          : e.key === 'ArrowDown'
          ? rowStep
          : e.key === 'ArrowUp'
          ? -rowStep
          : 0
      if (step === 0) return
      e.preventDefault()
      move(step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, byteCount, rowStep])

  // グリッドは読む順 (1 行目が上) のまま。下から積むと行番号と読み順が逆になる
  const main = rows.map((bits, i) => (
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
          const hl = highlight && a >= byteStart && a < byteEnd
          return (
            <span
              key={col}
              onClick={() =>
                highlight && setCursor(Math.floor(a / CURSOR_BITS))
              }
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
  ))

  return (
    <Screen
      isTest
      class="quiz-screen"
      main={main}
      dock={
        <>
          <DockBar
            title={
              <span
                style={{
                  ...mono,
                  color: remain <= 30 ? 'var(--red, #f87171)' : 'var(--accent)',
                }}
              >
                {mmss(remain)}
              </span>
            }
            sub={`${rows.length}行 記憶`}
          >
            <QuitButton label="やめる" onClick={onQuit} />
          </DockBar>
          {/* カーソル送り(8bit=1バイトずつ) + 記憶終了 */}
          {highlight && (
            <DockRow>
              <button
                class="filter-btn"
                style={{ padding: '16px 0', fontSize: 20 }}
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
                style={{ padding: '16px 0', fontSize: 20 }}
                disabled={cursor >= byteCount - 1}
                onClick={() => move(1)}
              >
                ▶
              </button>
            </DockRow>
          )}
          <button
            class="filter-btn"
            style={{ padding: '10px 0', fontWeight: 700 }}
            onClick={onEnd}
          >
            記憶終了→回答
          </button>
        </>
      }
    />
  )
}

// バイト1個の表示(2進 or hex)。空(未到達)は placeholder。
function dispByte(bits: string, mode: 'bin' | 'hex'): string {
  if (!bits) return mode === 'hex' ? '··' : '········'
  if (mode === 'hex') return byteToHex(bits) ?? bits // 末尾端数はビットのまま
  return bits
}

const DIFF_BG: Record<ByteDiffCell['state'], string> = {
  match: 'color-mix(in srgb, var(--green, #34d399) 22%, transparent)',
  miss: 'color-mix(in srgb, var(--red, #f87171) 22%, transparent)',
  blank: 'transparent',
}

// 結果: byte単位の diff。4bit/8bit抜けで「それ以外は合っていたか」を確認する。
// 2進 ⇔ HEX 切替。行ごとの公式点数はおまけとして下部に出す。
function BinaryResult({
  rows,
  entered,
  time,
  onClose,
}: {
  rows: string[]
  entered: string
  time: number
  onClose: () => void
}) {
  const [mode, setMode] = useState<'bin' | 'hex'>('bin')
  const correctStream = rows.join('')
  const cells = byteDiff(entered, correctStream)
  const matched = cells.filter((c) => c.state === 'match').length
  const {
    points,
    maxPoints,
    rows: rowScores,
  } = scoreBinary(chunkRows(entered), rows)
  const cellW = mode === 'hex' ? 30 : 74

  const main = (
    <>
      {/* byte diff */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {cells.map((c) => (
          <span
            key={c.index}
            title={`${c.index + 1}バイト目`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: cellW,
              padding: '2px 0',
              borderRadius: 5,
              background: DIFF_BG[c.state],
              border:
                c.state === 'miss'
                  ? '1px solid var(--red, #f87171)'
                  : '1px solid transparent',
            }}
          >
            <span style={{ ...mono, fontSize: 13, fontWeight: 600 }}>
              {dispByte(c.correct, mode)}
            </span>
            {c.state === 'miss' && (
              <span
                style={{
                  ...mono,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--red, #f87171)',
                }}
              >
                {dispByte(c.user, mode)}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* おまけ: 行ごとの公式点数 */}
      <div
        style={{ fontSize: 11, color: 'var(--text2)', margin: '16px 0 6px' }}
      >
        行ごとの点数（おまけ）
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          ...mono,
          fontSize: 12,
        }}
      >
        {rowScores.map((r) => (
          <span
            key={r.index}
            style={{
              color:
                r.points === COLS
                  ? 'var(--green, #34d399)'
                  : r.points > 0
                  ? 'var(--amber, #fbbf24)'
                  : 'var(--text2)',
            }}
          >
            {r.index + 1}:{r.points}
          </span>
        ))}
      </div>
    </>
  )

  return (
    <Screen
      isTest
      class="quiz-screen"
      main={main}
      dock={
        <>
          <DockBar
            title={
              <>
                結果{' '}
                <span style={mono}>
                  {points}/{maxPoints}pt
                </span>
              </>
            }
            sub={`${matched}/${cells.length}バイト一致 · 記憶${time}s`}
          >
            <QuitButton label="閉じる" onClick={onClose} />
          </DockBar>
          {/* 2進 / HEX 切替 */}
          <DockRow>
            {(['bin', 'hex'] as const).map((m) => (
              <button
                key={m}
                class={'filter-btn' + (mode === m ? ' active' : '')}
                onClick={() => setMode(m)}
              >
                {m === 'bin' ? '2進' : 'HEX'}
              </button>
            ))}
            <span class="dock-row-label">
              正解 / <span style={{ color: 'var(--red, #f87171)' }}>回答</span>
            </span>
          </DockRow>
        </>
      }
    />
  )
}

function BinaryTest({
  title,
  memoSec,
  recallSec,
  rows,
  highlight,
  onQuit,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'memo' | 'recall' | 'done'>('memo')
  const [finalEntered, setFinalEntered] = useState('')
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
    setFinalEntered(nextEntered)
    onComplete({
      score: points,
      total,
      time: memoUsedRef.current,
      reviews: buildReviews(userRows, rows),
    })
    setPhase('done')
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
    // 振動は TestPad が押下時に鳴らす (ここでも鳴らすと 2 回になる)
    setEnteredBoth(next)
    if (next.length >= total) finish(next)
  }

  const backspace = () => setEnteredBoth(entered.slice(0, -1))

  if (phase === 'done') {
    return (
      <BinaryResult
        rows={rows}
        entered={finalEntered}
        time={memoUsedRef.current}
        onClose={onQuit}
      />
    )
  }

  if (phase === 'memo') {
    return (
      <MemoView
        rows={rows}
        remain={remain}
        highlight={highlight}
        onQuit={onQuit}
        onEnd={endMemo}
      />
    )
  }

  // 回答フェーズ: 記憶と同じ揃ったグリッド(30列均等)を全行表示し、左上から埋める。
  const enteredRows = chunkRows(entered)
  const curRow = Math.min(Math.floor(entered.length / COLS), rows.length - 1)
  const curCol = entered.length - curRow * COLS

  const main = rows.map((_, i) => {
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
  })

  const isFull = entered.length >= total

  return (
    <Screen
      isTest
      class="quiz-screen"
      main={main}
      dock={
        <>
          <DockBar
            title={
              <>
                {title} 回答{' '}
                <span
                  style={{
                    ...mono,
                    color:
                      remainR <= 30 ? 'var(--red, #f87171)' : 'var(--accent)',
                  }}
                >
                  {mmss(remainR)}
                </span>
              </>
            }
            sub={`${curRow + 1}/${rows.length}行 ${curCol}/${COLS}`}
          >
            <QuitButton label="終了して採点" onClick={() => finish(entered)} />
          </DockBar>
          {/* 0/1 キーパッド(dock の最下段) */}
          <TestPad
            cols={2}
            keys={['0', '1'].map((k) => ({ value: k, disabled: isFull }))}
            onPress={press}
            onBackspace={backspace}
            backspaceDisabled={entered.length === 0}
          />
        </>
      }
    />
  )
}

export default BinaryTest
