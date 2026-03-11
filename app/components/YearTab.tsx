import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { Record } from '../data/schema'
import { YEAR_DATA } from '../data/constants'
import { loadYearRecords, saveYearRecords } from '../data/storage'
import NumDetailPanel from './NumDetailPanel'
import RecordPanel from './RecordPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onCheckingChange?: (checking: boolean) => void
}

type CheckResult = {
  no: number
  input: string
  year: string
  correct: boolean
}
type Mode = 'view' | 'check'

function YearCheckRow({
  item,
  result,
  isCurrent,
  inputDigits,
}: {
  item: { no: number; year: string; event: string }
  result: CheckResult | undefined
  isCurrent: boolean
  inputDigits: string[]
}) {
  const yearDigits = item.year.split('')
  const cls =
    'year-row' +
    (result ? (result.correct ? ' correct' : ' wrong') : '') +
    (isCurrent ? ' current' : '')

  return (
    <div class={cls}>
      <span class="yr-no">{item.no}</span>
      {result ? (
        <>
          <span
            class="yr-year"
            style={{
              color: result.correct ? 'var(--accent)' : '#f87171',
            }}
          >
            {result.correct ? item.year : result.input}
          </span>
          {!result.correct ? (
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
              {item.year}
            </span>
          ) : null}
        </>
      ) : isCurrent ? (
        <div class="year-input">
          {yearDigits.map((_, di) => {
            const filled = di < inputDigits.length
            const isCursor = di === inputDigits.length
            const cls2 =
              'yr-digit' +
              (filled ? ' filled' : '') +
              (isCursor ? ' cursor' : '') +
              (!filled && !isCursor ? ' empty' : '')
            return (
              <div key={di} class={cls2}>
                {filled ? inputDigits[di] : isCursor ? '_' : '\u00b7'}
              </div>
            )
          })}
        </div>
      ) : (
        <span class="yr-year hidden">
          {'\u00b7'.repeat(item.year.length)}
        </span>
      )}
      <span class="yr-event">{item.event}</span>
    </div>
  )
}

function YearViewRow({
  item,
  idx,
  selected,
  onSelect,
}: {
  item: { no: number; year: string; event: string }
  idx: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      class={'year-row' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      <span class="yr-no">{item.no}</span>
      <span class="yr-year">{item.year}</span>
      <span class="yr-mod">{Number(item.year) % 7}</span>
      <span class="yr-event">{item.event}</span>
    </div>
  )
}

function YearTab({
  numbers,
  bookmarks,
  onToggleBm,
  onCheckingChange,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [checkIdx, setCheckIdx] = useState(0)
  const [digitPos, setDigitPos] = useState(0)
  const [inputDigits, setInputDigits] = useState<string[]>([])
  const [results, setResults] = useState<CheckResult[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [records, setRecords] = useState<Record[]>(loadYearRecords)
  const [showRecords, setShowRecords] = useState(false)

  const deleteRecord = useCallback(
    (idx: number) => {
      const newRecords = records.filter((_, i) => i !== idx)
      setRecords(newRecords)
      saveYearRecords(newRecords)
    },
    [records]
  )

  const clearRecords = useCallback(() => {
    setRecords([])
    saveYearRecords([])
  }, [])

  const startCheck = useCallback(() => {
    setMode('check')
    setCheckIdx(0)
    setDigitPos(0)
    setInputDigits([])
    setResults([])
    setStartTime(Date.now())
    setSelected(null)
    onCheckingChange && onCheckingChange(true)
  }, [onCheckingChange])

  const endCheck = useCallback(
    (finalResults?: CheckResult[]) => {
      const used = finalResults || results
      const elapsed = startTime
        ? Math.round((Date.now() - startTime) / 1000)
        : 0
      const correctCount = used.filter((r) => r.correct).length
      const record = {
        date: new Date().toISOString(),
        score: correctCount,
        total: used.length,
        time: elapsed,
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveYearRecords(newRecords)
      setMode('view')
      onCheckingChange && onCheckingChange(false)
    },
    [startTime, results, records, onCheckingChange]
  )

  const tapDigit = useCallback(
    (digit: number) => {
      if (mode !== 'check') return
      const item = YEAR_DATA[checkIdx]
      const yearDigits = item.year.split('')
      const newInput = [...inputDigits, String(digit)]
      setInputDigits(newInput)

      if (newInput.length >= yearDigits.length) {
        const inputStr = newInput.join('')
        const isCorrect = inputStr === item.year
        const newResults = [
          ...results,
          {
            no: item.no,
            input: inputStr,
            year: item.year,
            correct: isCorrect,
          },
        ]
        setResults(newResults)
        setInputDigits([])
        setDigitPos(0)
        const nextIdx = checkIdx + 1
        if (nextIdx >= YEAR_DATA.length) {
          endCheck(newResults)
          return
        }
        setCheckIdx(nextIdx)
      } else {
        setDigitPos(newInput.length)
      }
    },
    [mode, checkIdx, inputDigits, results, endCheck]
  )

  const selectedNums = useMemo(() => {
    if (selected === null || !numbers) return null
    const item = YEAR_DATA[selected]
    const year = item.year
    const matched: NumberEntry[] = []
    if (year.length === 4) {
      const n1 = numbers.find((d) => d.num === year.slice(1))
      if (n1) matched.push(n1)
    } else if (year.length === 3) {
      const n1 = numbers.find((d) => d.num === year)
      if (n1) matched.push(n1)
    }
    return matched.length > 0 ? matched : null
  }, [selected, numbers])

  const lastRecord = records.length > 0 ? records[0] : null
  const bestRecord =
    records.length > 0
      ? records.reduce(
          (best, r) => (r.score > best.score ? r : best),
          records[0]
        )
      : null

  return (
    <div class="year-layout">
      <div class="year-header">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
            年号記憶
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
            {YEAR_DATA.length}問
          </div>
          {mode === 'view' && lastRecord ? (
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
              前回:
              <span style={{ color: 'var(--accent)' }}>
                {lastRecord.score}/{lastRecord.total}
              </span>
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
                  {checkIdx + 1}/{YEAR_DATA.length}{' '}
                  {results.filter((r) => r.correct).length}正解
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
      {mode === 'view' ? (
        <div class="sticky-wrap">
          {selectedNums ? (
            <>
              {selectedNums.map((d) => (
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
            <div class="sticky-empty">年号をタップして詳細表示</div>
          )}
        </div>
      ) : null}
      {showRecords ? (
        <RecordPanel
          title="年号"
          records={records}
          onDelete={deleteRecord}
          onClear={clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div class="year-list">
          {mode === 'check'
            ? YEAR_DATA.map((item, idx) => {
                const result = results.find((r) => r.no === item.no)
                const isCurrent = idx === checkIdx
                return (
                  <YearCheckRow
                    key={idx}
                    item={item}
                    result={result}
                    isCurrent={isCurrent}
                    inputDigits={inputDigits}
                  />
                )
              })
            : YEAR_DATA.map((item, idx) => (
                <YearViewRow
                  key={idx}
                  item={item}
                  idx={idx}
                  selected={selected === idx}
                  onSelect={() =>
                    setSelected(selected === idx ? null : idx)
                  }
                />
              ))}
        </div>
      </div>
      {mode === 'check' ? (
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
                onClick={() => tapDigit(digit)}
              >
                {digit}
              </div>
            ))}
            <div
              key={0}
              class="np-numkey zero"
              onClick={() => tapDigit(0)}
            >
              0
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default YearTab
