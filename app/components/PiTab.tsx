import { h } from 'preact'
import { useState, useCallback, useMemo, useEffect } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { Record } from '../data/schema'
import { PI_DIGITS, PI_1000_DIGITS, DIGIT_COLORS } from '../data/constants'
import { loadPiRecords, savePiRecords } from '../data/storage'
import NumDetailPanel from './NumDetailPanel'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import type { ReviewItem } from './ReviewPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onCheckingChange?: (checking: boolean) => void
}

type Answer = { idx: number; digit: string; correct: boolean }
type Mode = 'view' | 'check'
type DigitMode = 100 | 1000

function PiCheckGrid({
  answers,
  checkPos,
  digits,
  totalDigits,
  compact,
}: {
  answers: Answer[]
  checkPos: number
  digits: string[]
  totalDigits: number
  compact?: boolean
}) {
  return (
    <div class={`pi-check-grid${compact ? ' compact' : ''}`}>
      {digits.slice(1, totalDigits + 1).map((d, j) => {
        const idx = j + 1
        const answered = answers.find((a) => a.idx === idx)
        const isCurrent = idx === checkPos
        const cls =
          'pi-check-cell' +
          (isCurrent ? ' current' : '') +
          (answered
            ? answered.correct
              ? ' correct'
              : ' wrong'
            : !answered && idx > checkPos
            ? ' pending'
            : '')
        const cellColor = DIGIT_COLORS[Number(d)]
        return (
          <div key={idx} class={cls}>
            {answered ? (
              <div
                class="pi-digit"
                style={{
                  color: answered.correct ? cellColor : '#f87171',
                }}
              >
                {answered.correct ? d : answered.digit}
              </div>
            ) : (
              <div class="pi-digit" style={{ color: 'var(--border)' }}>
                {isCurrent ? '_' : '\u00b7'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PiViewGroups({
  selected,
  onSelect,
  digits,
  groupCount,
  pairCount,
}: {
  selected: number | null
  onSelect: (g: number | null) => void
  digits: string[]
  groupCount: number
  pairCount: number
}) {
  const renderGroup = (g: number) => {
    const startIdx = 1 + g * 3
    const groupDigits = digits.slice(
      startIdx,
      Math.min(startIdx + 3, digits.length)
    )
    if (groupDigits.length === 0) return null
    const pairOf =
      selected !== null ? (selected % 2 === 0 ? selected : selected - 1) : -1
    const isGroupSelected = g === pairOf || g === pairOf + 1
    return (
      <div
        class={'pi-group' + (isGroupSelected ? ' selected' : '')}
        onClick={() =>
          groupDigits.length === 3 && onSelect(selected === g ? null : g)
        }
      >
        {groupDigits.map((d, j) => {
          const idx = startIdx + j
          const cellColor = DIGIT_COLORS[Number(d)]
          return (
            <div key={idx} class="pi-cell">
              <div class="pi-digit" style={{ color: cellColor }}>
                {d}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const out = []
  for (let p = 0; p < groupCount; p += 2) {
    const g1 = renderGroup(p)
    const g2 = p + 1 < groupCount ? renderGroup(p + 1) : null
    out.push(
      <div key={'p' + p} class="pi-pair">
        {g1}
        {g2 ? <div class="pi-pair-sep" /> : null}
        {g2}
      </div>
    )
  }

  // Invisible spacers to left-align the last row with space-between
  const spacers = Array.from({ length: Math.min(pairCount, 6) }, (_, i) => (
    <div key={'sp' + i} class="pi-pair spacer" aria-hidden="true">
      <div class="pi-group">
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
      </div>
      <div class="pi-pair-sep" />
      <div class="pi-group">
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
        <div class="pi-cell">
          <div class="pi-digit">0</div>
        </div>
      </div>
    </div>
  ))

  return (
    <div>
      <div class="pi-dot-cell">3.</div>
      <div class="pi-groups">
        {out}
        {spacers}
      </div>
    </div>
  )
}

function Numpad({
  onTapDigit,
  colored,
}: {
  onTapDigit: (digit: number) => void
  colored?: boolean
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
      <div class="np-numpad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <div
            key={digit}
            class="np-numkey"
            style={colored ? { color: DIGIT_COLORS[digit] } : {}}
            onClick={() => onTapDigit(digit)}
          >
            {digit}
          </div>
        ))}
        <div
          key={0}
          class="np-numkey zero"
          style={colored ? { color: DIGIT_COLORS[0] } : {}}
          onClick={() => onTapDigit(0)}
        >
          0
        </div>
      </div>
    </div>
  )
}

function PiTab({ numbers, bookmarks, onToggleBm, onCheckingChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [digitMode, setDigitMode] = useState<DigitMode>(100)
  const [checkPos, setCheckPos] = useState(1)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const storageKey = digitMode === 100 ? 'pi999' : 'pi1000'
  const [records, setRecords] = useState<Record[]>(() =>
    loadPiRecords(storageKey)
  )
  const [finished, setFinished] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState({ score: 0, total: 0, time: 0 })

  useEffect(() => {
    setRecords(loadPiRecords(storageKey))
  }, [digitMode])

  const digits = digitMode === 100 ? PI_DIGITS : PI_1000_DIGITS
  const totalDigits = digitMode
  const groupCount = Math.ceil((digits.length - 1) / 3)
  const pairCount = Math.ceil(groupCount / 2)

  const deleteRecord = useCallback(
    (idx: number) => {
      const newRecords = records.filter((_, i) => i !== idx)
      setRecords(newRecords)
      savePiRecords(newRecords, storageKey)
    },
    [records, storageKey]
  )

  const clearRecords = useCallback(() => {
    setRecords([])
    savePiRecords([], storageKey)
  }, [storageKey])

  const startCheck = useCallback(() => {
    setMode('check')
    setCheckPos(1)
    setAnswers([])
    setStartTime(Date.now())
    setFinished(false)
    setSelected(null)
    onCheckingChange && onCheckingChange(true)
  }, [onCheckingChange])

  const endCheck = useCallback(
    (finalAnswers?: Answer[]) => {
      const used = finalAnswers || answers
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
      savePiRecords(newRecords, storageKey)

      // Build review — group by 3-digit blocks, show only wrong ones individually
      const items: ReviewItem[] = used.map((a) => {
        const pos = a.idx + 1
        return {
          label: `${pos}桁目`,
          correct: a.correct,
          userAnswer: a.correct ? undefined : a.digit,
          rightAnswer: digits[a.idx],
        }
      })
      setReviewItems(items)
      setReviewMeta({ score: correctCount, total: used.length, time: elapsed })

      setMode('view')
      setFinished(true)
      onCheckingChange && onCheckingChange(false)
    },
    [startTime, answers, records, storageKey, digits, onCheckingChange]
  )

  const tapDigit = useCallback(
    (digit: number) => {
      if (mode !== 'check' || finished) return
      const expected = digits[checkPos]
      const isCorrect = String(digit) === expected
      const newAnswer = {
        idx: checkPos,
        digit: String(digit),
        correct: isCorrect,
      }
      const newAnswers = [...answers, newAnswer]
      setAnswers(newAnswers)
      const nextPos = checkPos + 1
      if (nextPos > totalDigits) {
        endCheck(newAnswers)
        return
      }
      setCheckPos(nextPos)
    },
    [mode, finished, checkPos, answers, endCheck, digits, totalDigits]
  )

  const lastRecord = records.length > 0 ? records[0] : null
  const bestRecord =
    records.length > 0
      ? records.reduce(
          (best, r) => (r.score > best.score ? r : best),
          records[0]
        )
      : null

  const selectedPair = useMemo(() => {
    if (selected === null || !numbers) return null
    const pairStart = selected % 2 === 0 ? selected : selected - 1
    const result: NumberEntry[] = []
    for (let i = 0; i < 2; i++) {
      const g = pairStart + i
      if (g >= groupCount) break
      const startIdx = 1 + g * 3
      const numStr = digits.slice(startIdx, startIdx + 3).join('')
      if (numStr.length < 3) break
      const found = numbers.find((d) => d.num === numStr)
      if (found) result.push(found)
    }
    return result.length > 0 ? result : null
  }, [selected, numbers, digits, groupCount])

  return (
    <div class="pi-layout">
      <PiHeader
        mode={mode}
        digitMode={digitMode}
        lastRecord={lastRecord}
        bestRecord={bestRecord}
        finished={finished}
        records={records}
        checkPos={checkPos}
        answers={answers}
        onStartCheck={startCheck}
        onEndCheck={() => endCheck()}
        onShowRecords={() => setShowRecords(true)}
        onToggleDigitMode={() => setDigitMode((d) => (d === 100 ? 1000 : 100))}
      />
      {mode === 'view' ? (
        <div class="sticky-wrap">
          {selectedPair ? (
            <>
              {selectedPair.map((d) => (
                <NumDetailPanel
                  key={d.num}
                  d={d}
                  bookmarks={bookmarks}
                  onToggleBm={onToggleBm}
                />
              ))}
              <div style={{ padding: '0 12px 8px' }}>
                <button
                  class="d2-mode-btn"
                  style={{ padding: '4px 10px', width: '100%' }}
                  onClick={() => setSelected(null)}
                >
                  閉じる
                </button>
              </div>
            </>
          ) : (
            <div class="sticky-empty">グループをタップして詳細表示</div>
          )}
        </div>
      ) : null}
      {showRecords ? (
        <RecordPanel
          title="π"
          records={records}
          onDelete={deleteRecord}
          onClear={clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}
      {reviewItems ? (
        <ReviewPanel
          title="π"
          score={reviewMeta.score}
          total={reviewMeta.total}
          time={reviewMeta.time}
          items={reviewItems}
          onClose={() => setReviewItems(null)}
        />
      ) : null}
      <div
        class="content"
        style={{
          flex: 1,
          paddingBottom: '4px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {mode === 'check' ? (
          <PiCheckGrid
            answers={answers}
            checkPos={checkPos}
            digits={digits}
            totalDigits={totalDigits}
            compact={digitMode === 1000}
          />
        ) : (
          <PiViewGroups
            selected={selected}
            onSelect={setSelected}
            digits={digits}
            groupCount={groupCount}
            pairCount={pairCount}
          />
        )}
      </div>
      {mode === 'check' ? <Numpad onTapDigit={tapDigit} colored /> : null}
    </div>
  )
}

type PiHeaderProps = {
  mode: Mode
  digitMode: DigitMode
  lastRecord: Record | null
  bestRecord: Record | null
  finished: boolean
  records: Record[]
  checkPos: number
  answers: Answer[]
  onStartCheck: () => void
  onEndCheck: () => void
  onShowRecords: () => void
  onToggleDigitMode: () => void
}

function PiHeader({
  mode,
  digitMode,
  lastRecord,
  bestRecord,
  finished,
  records,
  checkPos,
  answers,
  onStartCheck,
  onEndCheck,
  onShowRecords,
  onToggleDigitMode,
}: PiHeaderProps) {
  const decimalCount = digitMode === 100 ? 111 : 1000
  return (
    <div class="pi-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div class="pi-header-title">π 円周率</div>
        <div class="pi-header-sub">
          {decimalCount}桁 (テスト{digitMode}桁)
        </div>
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
              <button
                class="filter-btn"
                style={{
                  fontSize: '11px',
                  minWidth: '40px',
                  padding: '4px 8px',
                }}
                onClick={onToggleDigitMode}
              >
                {digitMode === 100 ? '1000' : '100'}
              </button>
              {records.length > 0 ? (
                <button
                  class="filter-btn"
                  style={{
                    fontSize: '11px',
                    minWidth: '40px',
                    padding: '4px 8px',
                  }}
                  onClick={onShowRecords}
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
                onClick={onStartCheck}
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
                {checkPos - 1}桁目 {answers.filter((a) => a.correct).length}/
                {answers.length}
              </span>
              <button
                class="filter-btn"
                style={{
                  fontSize: '12px',
                  minWidth: '50px',
                  padding: '4px 10px',
                }}
                onClick={onEndCheck}
              >
                終了
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PiTab
