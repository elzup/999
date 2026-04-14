import { h } from 'preact'
import { useState, useCallback, useMemo, useEffect, useRef } from 'preact/hooks'
import type { NumberEntry, YearItem } from '../data/schema'
import type { Record } from '../data/schema'
import { YEAR_DATA, DIGIT_COLORS, XY_TO_Z } from '../data/constants'

type EraId =
  | 'all'
  | 'bc'
  | 'bc500'
  | 'e0'
  | 'e500'
  | 'e1000'
  | 'e1500'
  | 'e1800'
  | 'e1900'
  | 'e2000'

const ERAS: { id: EraId; label: string; from: number; to: number }[] = [
  { id: 'all', label: '全て', from: -Infinity, to: Infinity },
  { id: 'bc', label: '〜-500', from: -Infinity, to: -500 },
  { id: 'bc500', label: '-500〜0', from: -500, to: 0 },
  { id: 'e0', label: '0〜500', from: 0, to: 500 },
  { id: 'e500', label: '500〜1000', from: 500, to: 1000 },
  { id: 'e1000', label: '1000〜1500', from: 1000, to: 1500 },
  { id: 'e1500', label: '1500〜1800', from: 1500, to: 1800 },
  { id: 'e1800', label: '1800〜1900', from: 1800, to: 1900 },
  { id: 'e1900', label: '1900〜2000', from: 1900, to: 2000 },
  { id: 'e2000', label: '2000〜', from: 2000, to: Infinity },
]

function filterByEra(era: EraId): YearItem[] {
  const found = ERAS.find((e) => e.id === era)
  if (!found || era === 'all') return [...YEAR_DATA].sort((a, b) => Number(a.year) - Number(b.year))
  return YEAR_DATA
    .filter((item) => {
      const y = Number(item.year)
      return y >= found.from && y < found.to
    })
    .sort((a, b) => Number(a.year) - Number(b.year))
}
import { loadYearRecords, saveYearRecords } from '../data/storage'
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

type CheckResult = {
  no: number
  input: string
  xyz: string
  correct: boolean
}
type Mode = 'view' | 'check'

/** Extract XYZ (last 3 digits) from a year string */
function getXYZ(year: string): string {
  return year.length >= 4 ? year.slice(-3) : year.padStart(3, '0')
}

/** Extract C prefix (thousands digit) from a year string */
function getC(year: string): string {
  return year.length >= 4 ? year.slice(0, -3) : ''
}

function YearCheckRow({
  item,
  result,
  isCurrent,
  inputDigits,
}: {
  item: { no: number; year: string; event: string; desc: string }
  result: CheckResult | undefined
  isCurrent: boolean
  inputDigits: string[]
}) {
  const xyz = getXYZ(item.year)
  const c = getC(item.year)
  const xyzDigits = xyz.split('')
  const cls =
    'year-row' +
    (result ? (result.correct ? ' correct' : ' wrong') : '') +
    (isCurrent ? ' current' : '')

  return (
    <div class={cls}>
      <span class="yr-no">{item.no}</span>
      {result ? (
        <>
          <span class="yr-c">{c}</span>
          <span
            class="yr-xyz"
            style={{
              color: result.correct ? 'var(--accent)' : '#f87171',
            }}
          >
            {result.correct ? xyz : result.input}
          </span>
          {!result.correct ? (
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
              {xyz}
            </span>
          ) : null}
        </>
      ) : isCurrent ? (
        <>
          <span class="yr-c">{c}</span>
          <div class="year-input">
            {xyzDigits.map((_, di) => {
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
        </>
      ) : (
        <>
          <span class="yr-c">{c}</span>
          <span class="yr-xyz hidden">
            {'\u00b7\u00b7\u00b7'}
          </span>
        </>
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
  item: { no: number; year: string; event: string; desc: string }
  idx: number
  selected: boolean
  onSelect: () => void
}) {
  const c = getC(item.year)
  const xyz = getXYZ(item.year)
  const xy = xyz.slice(0, 2)
  const z = XY_TO_Z[xy]
  return (
    <div
      class={'year-row' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      <span class="yr-no">{item.no}</span>
      <span class="yr-year">
        <span class="yr-c">{c}</span>
        <span class="yr-xyz">{xyz}</span>
      </span>
      <span
        class="yr-mod"
        style={{ color: z !== undefined ? DIGIT_COLORS[Number(z)] : undefined }}
      >
        {z ?? '?'}
      </span>
      <span class="yr-event">
        {item.event}
        <span class="yr-desc">{item.desc}</span>
      </span>
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
  const [eraFilter, setEraFilter] = useState<EraId>('all')
  const [checkItems, setCheckItems] = useState<YearItem[]>([])
  const [checkIdx, setCheckIdx] = useState(0)
  const [inputDigits, setInputDigits] = useState<string[]>([])
  const [results, setResults] = useState<CheckResult[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [records, setRecords] = useState<Record[]>(loadYearRecords)
  const [showRecords, setShowRecords] = useState(false)
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState({ score: 0, total: 0, time: 0 })
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode === 'check') {
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
  }, [mode, startTime])

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

  const startCheck = useCallback(
    (era: EraId) => {
      const items = filterByEra(era)
      if (items.length === 0) return
      setCheckItems(items)
      setMode('check')
      setCheckIdx(0)
      setInputDigits([])
      setResults([])
      setStartTime(Date.now())
      setElapsed(0)
      setSelected(null)
      onCheckingChange?.(true)
    },
    [onCheckingChange]
  )

  const endCheck = useCallback(
    (finalResults?: CheckResult[]) => {
      const used = finalResults ?? results
      const el = startTime
        ? Math.round((Date.now() - startTime) / 1000)
        : 0
      const correctCount = used.filter((r) => r.correct).length
      const record = {
        date: new Date().toISOString(),
        score: correctCount,
        total: used.length,
        time: el,
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveYearRecords(newRecords)

      // Build review items
      const items: ReviewItem[] = used.map((r) => {
        const item = checkItems.find((ci) => ci.no === r.no)
        return {
          label: item ? `${item.year} ${item.event}` : `#${r.no}`,
          correct: r.correct,
          userAnswer: r.correct ? undefined : r.input,
          rightAnswer: r.xyz,
        }
      })
      setReviewItems(items)
      setReviewMeta({ score: correctCount, total: used.length, time: el })

      setMode('view')
      onCheckingChange?.(false)
    },
    [startTime, results, records, checkItems, onCheckingChange]
  )

  const tapDigit = useCallback(
    (digit: number) => {
      if (mode !== 'check') return
      const item = checkItems[checkIdx]
      if (!item) return
      const xyz = getXYZ(item.year)
      const newInput = [...inputDigits, String(digit)]
      setInputDigits(newInput)

      if (newInput.length >= 3) {
        const inputStr = newInput.join('')
        const isCorrect = inputStr === xyz
        const newResults = [
          ...results,
          {
            no: item.no,
            input: inputStr,
            xyz,
            correct: isCorrect,
          },
        ]
        setResults(newResults)
        setInputDigits([])
        const nextIdx = checkIdx + 1
        if (nextIdx >= checkItems.length) {
          endCheck(newResults)
          return
        }
        setCheckIdx(nextIdx)
      }
    },
    [mode, checkItems, checkIdx, inputDigits, results, endCheck]
  )

  const selectedNums = useMemo(() => {
    if (selected === null || !numbers) return null
    const item = YEAR_DATA[selected]
    const xyz = getXYZ(item.year)
    const entry = numbers.find((d) => d.num === xyz)
    return entry ? [entry] : null
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
            {mode === 'check'
              ? `${checkItems.length}問`
              : `${YEAR_DATA.length}問 (XYZ 3桁)`}
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
                  onClick={() => startCheck(eraFilter)}
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
                  {checkIdx + 1}/{checkItems.length}{' '}
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
            <div class="sticky-empty">年号をタップしてXYZの詳細表示</div>
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
      {reviewItems ? (
        <ReviewPanel
          title="年号"
          score={reviewMeta.score}
          total={reviewMeta.total}
          time={reviewMeta.time}
          items={reviewItems}
          onClose={() => setReviewItems(null)}
        />
      ) : null}
      {mode === 'view' ? (
        <div
          class="year-era-row"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            padding: '6px 8px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          {ERAS.map((era) => {
            const count =
              era.id === 'all'
                ? YEAR_DATA.length
                : filterByEra(era.id).length
            return (
              <button
                key={era.id}
                class={
                  'filter-btn' + (eraFilter === era.id ? ' active' : '')
                }
                style={{
                  fontSize: '11px',
                  minWidth: 'auto',
                  padding: '3px 8px',
                }}
                onClick={() => setEraFilter(era.id)}
              >
                {era.label}
                <span
                  style={{
                    marginLeft: '4px',
                    color: 'var(--text2)',
                    fontSize: '10px',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div class="year-list">
          {mode === 'check'
            ? checkItems.map((item, idx) => {
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
            : filterByEra(eraFilter).map((item) => {
                const idx = YEAR_DATA.indexOf(item)
                return (
                  <YearViewRow
                    key={item.no}
                    item={item}
                    idx={idx}
                    selected={selected === idx}
                    onSelect={() =>
                      setSelected(selected === idx ? null : idx)
                    }
                  />
                )
              })}
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
                style={{ color: DIGIT_COLORS[digit] }}
                onClick={() => tapDigit(digit)}
              >
                {digit}
              </div>
            ))}
            <div
              key={0}
              class="np-numkey zero"
              style={{ color: DIGIT_COLORS[0] }}
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
