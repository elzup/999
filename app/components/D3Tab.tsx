import { h } from 'preact'
import { useState, useCallback, useMemo, useEffect, useRef } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { Record as TestRecord } from '../data/schema'
import { DIGIT_COLORS } from '../data/constants'
import { loadD3Records, saveD3Records } from '../data/storage'
import NumDetailPanel from './NumDetailPanel'
import RecordPanel from './RecordPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onCheckingChange?: (checking: boolean) => void
}

// 100 XYZ entries: for each 2-digit prefix XY, a specific Z digit
const D3_LIST = [
  '000', '011', '022', '033', '045', '056', '060', '071', '083', '094',
  '105', '116', '121', '132', '143', '154', '166', '170', '181', '192',
  '204', '215', '226', '230', '242', '253', '264', '275', '280', '291',
  '302', '313', '325', '336', '340', '351', '363', '374', '385', '396',
  '401', '412', '423', '434', '446', '450', '461', '472', '484', '495',
  '506', '510', '522', '533', '544', '555', '560', '571', '582', '593',
  '605', '616', '620', '631', '643', '654', '665', '676', '681', '692',
  '703', '714', '726', '730', '741', '752', '764', '775', '786', '790',
  '802', '813', '824', '835', '840', '851', '862', '873', '885', '896',
  '900', '911', '923', '934', '945', '956', '961', '972', '983', '994',
] as const

type RevealState = Record<string, boolean>
type ViewMode = 'seq' | 'group'
type Mode = 'view' | 'check'
type Answer = { idx: number; xy: string; digit: string; correct: boolean }

// Group entries by last digit (Z), ordered 0-6
const Z_GROUPS: [string, string[]][] = (() => {
  const map: Record<string, string[]> = {}
  for (const xyz of D3_LIST) {
    const z = xyz[2]
    ;(map[z] ??= []).push(xyz)
  }
  return ['0', '1', '2', '3', '4', '5', '6']
    .filter((z) => map[z])
    .map((z) => [z, map[z]])
})()

// core kana for digits 0-6
const Z_KANA: Record<string, string> = {
  '0': 'ん', '1': 'い', '2': 'に', '3': 'さ', '4': 'し', '5': 'こ', '6': 'ろ',
}

// Build XY -> Z lookup
const XY_TO_Z: Record<string, string> = {}
for (const xyz of D3_LIST) {
  XY_TO_Z[xyz.slice(0, 2)] = xyz[2]
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function D3Numpad({
  onTapDigit,
}: {
  onTapDigit: (digit: number) => void
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '8px 12px',
      }}
    >
      <div class="d3-numpad">
        {[1, 2, 3, 4, 5, 6].map((digit) => (
          <div
            key={digit}
            class="np-numkey"
            style={{ color: DIGIT_COLORS[digit] }}
            onClick={() => onTapDigit(digit)}
          >
            {digit}
          </div>
        ))}
        <div
          key={0}
          class="np-numkey"
          style={{ color: DIGIT_COLORS[0], gridColumn: '1' }}
          onClick={() => onTapDigit(0)}
        >
          0
        </div>
      </div>
    </div>
  )
}

function D3CheckGrid({
  order,
  answers,
  checkIdx,
}: {
  order: string[]
  answers: Answer[]
  checkIdx: number
}) {
  // Build answer map keyed by xyz for quick lookup
  const answerMap = useMemo(() => {
    const m = new Map<string, Answer>()
    for (const a of answers) {
      m.set(a.xy, a)
    }
    return m
  }, [answers])

  return (
    <div class="d3-check-grid">
      {order.map((xyz, i) => {
        const xy = xyz.slice(0, 2)
        const z = xyz[2]
        const answered = answerMap.get(xy)
        const isCurrent = i === checkIdx
        const cls =
          'd3-check-cell' +
          (isCurrent ? ' current' : '') +
          (answered
            ? answered.correct
              ? ' correct'
              : ' wrong'
            : i > checkIdx
              ? ' pending'
              : '')
        return (
          <div key={xyz} class={cls}>
            <span class="d3-check-xy">{xy}</span>
            {answered ? (
              <span
                class="d3-check-z"
                style={{
                  color: answered.correct
                    ? DIGIT_COLORS[Number(z)]
                    : '#f87171',
                }}
              >
                {answered.correct ? z : answered.digit}
              </span>
            ) : (
              <span
                class="d3-check-z"
                style={{ color: 'var(--border)' }}
              >
                {isCurrent ? '_' : '\u00b7'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function D3Tab({ numbers, bookmarks, onToggleBm, onCheckingChange }: Props) {
  const [revealed, setRevealed] = useState<RevealState>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('group')
  const [mode, setMode] = useState<Mode>('view')
  const [order, setOrder] = useState<string[]>([])
  const [checkIdx, setCheckIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [records, setRecords] = useState<TestRecord[]>(loadD3Records)
  const [finished, setFinished] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [lastAnswers, setLastAnswers] = useState<Map<string, Answer>>(new Map())
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode === 'check' && !finished) {
      timerRef.current = window.setInterval(() => {
        setElapsed(startTime ? Math.round((Date.now() - startTime) / 1000) : 0)
      }, 1000)
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [mode, finished, startTime])

  const numMap = useMemo(() => {
    const m = new Map<string, NumberEntry>()
    for (const n of numbers) {
      m.set(n.num, n)
    }
    return m
  }, [numbers])

  const toggleReveal = useCallback((xyz: string) => {
    setRevealed((prev) => ({ ...prev, [xyz]: !prev[xyz] }))
    setSelected(xyz)
  }, [])

  const revealAll = useCallback(() => {
    const next: RevealState = {}
    for (const xyz of D3_LIST) {
      next[xyz] = true
    }
    setRevealed(next)
  }, [])

  const hideAll = useCallback(() => {
    setRevealed({})
    setSelected(null)
  }, [])

  const deleteRecord = useCallback(
    (idx: number) => {
      const newRecords = records.filter((_, i) => i !== idx)
      setRecords(newRecords)
      saveD3Records(newRecords)
    },
    [records]
  )

  const clearRecords = useCallback(() => {
    setRecords([])
    saveD3Records([])
  }, [])

  const startCheck = useCallback(() => {
    setOrder(shuffle(D3_LIST))
    setMode('check')
    setCheckIdx(0)
    setAnswers([])
    setStartTime(Date.now())
    setFinished(false)
    setSelected(null)
    onCheckingChange?.(true)
  }, [onCheckingChange])

  const endCheck = useCallback(
    (finalAnswers?: Answer[]) => {
      const used = finalAnswers ?? answers
      const elapsed = startTime
        ? Math.round((Date.now() - startTime) / 1000)
        : 0
      const correctCount = used.filter((a) => a.correct).length
      const record = {
        date: new Date().toISOString(),
        score: correctCount,
        total: used.length,
        time: elapsed,
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveD3Records(newRecords)
      const ansMap = new Map<string, Answer>()
      for (const a of used) {
        ansMap.set(a.xy, a)
      }
      setLastAnswers(ansMap)
      setMode('view')
      setFinished(true)
      onCheckingChange?.(false)
    },
    [startTime, answers, records, onCheckingChange]
  )

  const tapDigit = useCallback(
    (digit: number) => {
      if (mode !== 'check' || finished) return
      const xyz = order[checkIdx]
      const expected = xyz[2]
      const isCorrect = String(digit) === expected
      const newAnswer: Answer = {
        idx: checkIdx,
        xy: xyz.slice(0, 2),
        digit: String(digit),
        correct: isCorrect,
      }
      const newAnswers = [...answers, newAnswer]
      setAnswers(newAnswers)
      const nextIdx = checkIdx + 1
      if (nextIdx >= order.length) {
        endCheck(newAnswers)
        return
      }
      setCheckIdx(nextIdx)
    },
    [mode, finished, checkIdx, answers, order, endCheck]
  )

  const selectedPrefixEntry = useMemo(() => {
    if (selected === null) return null
    const prefix = '0' + selected.slice(0, 2)
    return numMap.get(prefix) ?? null
  }, [selected, numMap])

  const lastRecord = records.length > 0 ? records[0] : null
  const bestRecord =
    records.length > 0
      ? records.reduce(
          (best, r) => (r.score > best.score ? r : best),
          records[0]
        )
      : null

  const renderCell = (xyz: string) => {
    const xy = xyz.slice(0, 2)
    const z = xyz[2]
    const isRevealed = !!revealed[xyz]
    const isSelected = selected === xyz
    const lastAns = lastAnswers.get(xy)
    return (
      <div
        key={xyz}
        class={
          'd3-cell' +
          (isSelected ? ' selected' : '') +
          (isRevealed ? ' revealed' : '') +
          (lastAns ? (lastAns.correct ? ' last-correct' : ' last-wrong') : '')
        }
        onClick={() => toggleReveal(xyz)}
      >
        <span class="d3-prefix">{xy}</span>
        <span class={'d3-suffix' + (isRevealed ? '' : ' hidden')}>
          {isRevealed ? z : '?'}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div class="pi-header-title">年コード</div>
          <div class="pi-header-sub">2桁→1桁 (100問)</div>
          {mode === 'view' && (lastRecord || finished) ? (
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
              {lastRecord ? (
                <>
                  前回:
                  <span style={{ color: 'var(--accent)' }}>
                    {lastRecord.score}/{lastRecord.total}
                  </span>
                </>
              ) : null}
              {bestRecord ? (
                <>
                  {' '}
                  最高:
                  <span style={{ color: 'var(--warn)' }}>
                    {bestRecord.score}/{bestRecord.total}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            {mode === 'view' ? (
              <>
                {records.length > 0 ? (
                  <button
                    class="filter-btn"
                    style={{
                      fontSize: '11px',
                      minWidth: '40px',
                      padding: '4px 8px',
                    }}
                    onClick={() => setShowRecords(true)}
                  >
                    記録
                  </button>
                ) : null}
                <button
                  class="filter-btn"
                  style={{
                    fontSize: '12px',
                    minWidth: '60px',
                    padding: '4px 10px',
                  }}
                  onClick={startCheck}
                >
                  テスト
                </button>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--accent)',
                    fontFamily: 'monospace',
                  }}
                >
                  {elapsed}秒{' '}
                  {answers.filter((a) => a.correct).length}/{answers.length}
                </span>
                <button
                  class="filter-btn"
                  style={{
                    fontSize: '12px',
                    minWidth: '50px',
                    padding: '4px 10px',
                  }}
                  onClick={() => endCheck()}
                >
                  終了
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel (view mode only) */}
      {mode === 'view' ? (
        <div class="sticky-wrap" style={{ maxHeight: '50vh' }}>
          {selected !== null && selectedPrefixEntry ? (
            <div>
              <div class="d2-detail-header">
                <span class="detail-id">{selected.slice(0, 2)}</span>
                <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  → {selected[2]}
                </span>
                <button
                  class="d2-mode-btn"
                  style={{ padding: '4px 10px', flex: 'none', marginLeft: 'auto' }}
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </div>
              <div class="d2-detail-list">
                <NumDetailPanel
                  d={selectedPrefixEntry}
                  bookmarks={bookmarks}
                  onToggleBm={onToggleBm}
                />
              </div>
            </div>
          ) : (
            <div class="sticky-empty">XY → Z を選択</div>
          )}
        </div>
      ) : null}

      {/* Records overlay */}
      {showRecords ? (
        <RecordPanel
          title="年コード"
          records={records}
          onDelete={deleteRecord}
          onClear={clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}

      {/* Content area */}
      <div
        class="content"
        style={{
          flex: 1,
          paddingBottom: '4px',
          ...(mode === 'check'
            ? { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
            : {}),
        }}
      >
        {mode === 'check' ? (
          <D3CheckGrid order={order} answers={answers} checkIdx={checkIdx} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <button
                class={'d2-mode-btn' + (viewMode === 'group' ? ' active' : '')}
                onClick={() => setViewMode('group')}
              >
                末尾グループ
              </button>
              <button
                class={'d2-mode-btn' + (viewMode === 'seq' ? ' active' : '')}
                onClick={() => setViewMode('seq')}
              >
                数字順
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                <button class="d2-mode-btn" onClick={revealAll}>
                  全表示
                </button>
                <button class="d2-mode-btn" onClick={hideAll}>
                  全隠す
                </button>
              </div>
            </div>
            {viewMode === 'seq' ? (
              <div class="d3-grid">
                {D3_LIST.map((xyz) => renderCell(xyz))}
              </div>
            ) : (
              <div class="d3-groups">
                {Z_GROUPS.map(([z, items]) => {
                  const pairs: string[][] = []
                  for (let i = 0; i < items.length; i += 2) {
                    pairs.push(items.slice(i, i + 2))
                  }
                  return (
                    <div key={z} class="d3-z-section">
                      <div class="d3-z-label">
                        <span style={{ color: DIGIT_COLORS[Number(z)] }}>
                          {z}
                        </span>
                        <span style={{ color: 'var(--text2)', marginLeft: '4px' }}>
                          {Z_KANA[z]}
                        </span>
                        <span style={{ color: 'var(--text2)', marginLeft: '4px', fontSize: '11px' }}>
                          ({items.length})
                        </span>
                      </div>
                      <div class="d3-pairs">
                        {pairs.map((pair, pi) => (
                          <div key={pi} class="d3-pair">
                            {renderCell(pair[0])}
                            {pair[1] ? (
                              <>
                                <div class="d3-pair-sep" />
                                {renderCell(pair[1])}
                              </>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Numpad (check mode only, digits 0-6) */}
      {mode === 'check' ? (
        <D3Numpad onTapDigit={tapDigit} />
      ) : null}
    </div>
  )
}

export default D3Tab
