import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { Record } from '../data/schema'
import { PI_1000_DIGITS, DIGIT_COLORS } from '../data/constants'
import { loadPiRecords, savePiRecords } from '../data/storage'
import { vibrate } from '../lib/haptics'
import { genChoiceOptions } from '../lib/piChoice'
import type { ChoiceVariant, ChoiceOption } from '../lib/piChoice'
import NumDetailPanel from './NumDetailPanel'
import Numpad from './Numpad'
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
type ChoiceAnswer = { idx: number; picked: string; correct: boolean }
type Mode = 'view' | 'check' | 'choice'

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
  const decimalDigits = digits.slice(1, totalDigits + 1)
  const blockSize = compact ? 100 : totalDigits
  const blocks: { start: number; digits: string[] }[] = []
  for (let s = 0; s < decimalDigits.length; s += blockSize) {
    blocks.push({ start: s, digits: decimalDigits.slice(s, s + blockSize) })
  }

  return (
    <div class={`pi-check-grid${compact ? ' compact' : ''}`}>
      {blocks.map((block) => (
        <div key={block.start}>
          {blocks.length > 1 && (
            <div class="pi-block-label">
              {String(block.start + 1).padStart(3, '0')}–
              {String(block.start + block.digits.length).padStart(3, '0')}
            </div>
          )}
          <div class="pi-block-grid">
            {block.digits.map((d, j) => {
              const idx = block.start + j + 1
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
                      {isCurrent ? '_' : '·'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const CHOICE_WINDOW = 12

function PiChoiceProgress({
  answers,
  choicePos,
  chunkAt,
  chunkCount,
}: {
  answers: ChoiceAnswer[]
  choicePos: number
  chunkAt: (i: number) => string
  chunkCount: number
}) {
  // 現在位置の周辺だけ表示 (333 チャンク全部は見せない)
  const start = Math.max(0, Math.min(choicePos - 4, chunkCount - CHOICE_WINDOW))
  const items = Array.from(
    { length: Math.min(CHOICE_WINDOW, chunkCount - start) },
    (_, j) => start + j
  )

  return (
    <div class="pi-choice-progress">
      {items.map((i) => {
        const answered = answers.find((a) => a.idx === i)
        const isCurrent = i === choicePos
        const right = chunkAt(i)
        const cls =
          'pi-choice-chunk' +
          (isCurrent ? ' current' : '') +
          (answered ? (answered.correct ? ' correct' : ' wrong') : '') +
          (!answered && !isCurrent ? ' pending' : '')
        return (
          <div key={i} class={cls}>
            <span class="pi-choice-pos">{i * 3 + 1}</span>
            <span class="pi-choice-val">
              {answered
                ? answered.correct
                  ? right
                  : answered.picked
                : isCurrent
                ? '?'
                : '···'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PiChoiceOptions({
  options,
  onPick,
}: {
  options: ChoiceOption[]
  onPick: (value: string) => void
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '12px',
      }}
    >
      <div class="pi-choice-options">
        {options.map((opt) => (
          <button
            key={opt.value}
            class="pi-choice-opt"
            onClick={() => {
              vibrate()
              onPick(opt.value)
            }}
          >
            {opt.display.split('').map((ch, i) => (
              <span key={i} class={ch === 'X' ? 'pi-choice-mask' : ''}>
                {ch}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  )
}

type RowSeg = { gi: number; offset: number; count: number }

function PiViewGroups({
  selected,
  onSelect,
  digits,
}: {
  selected: number | null
  onSelect: (g: number | null) => void
  digits: string[]
}) {
  const decimalDigits = digits.slice(1)

  const rowPatterns: RowSeg[][] = [
    // line1: 3x8 + 1
    [
      ...Array.from({ length: 8 }, () => ({ gi: 0, offset: 0, count: 3 })),
      { gi: 0, offset: 0, count: 1 },
    ],
    // line2: 2 + 3x7 + 2
    [
      { gi: 0, offset: 0, count: 2 },
      ...Array.from({ length: 7 }, () => ({ gi: 0, offset: 0, count: 3 })),
      { gi: 0, offset: 0, count: 2 },
    ],
    // line3: 1 + 3x8
    [
      { gi: 0, offset: 0, count: 1 },
      ...Array.from({ length: 8 }, () => ({ gi: 0, offset: 0, count: 3 })),
    ],
  ]

  const rows: {
    segs: { gi: number; digits: { idx: number; digit: string }[] }[]
    isSectionEnd: boolean
  }[] = []
  let di = 0
  let gi = 0
  let offsetInGroup = 0
  while (di < decimalDigits.length) {
    const ri = rows.length
    const pattern = rowPatterns[ri % 3]
    const segs: { gi: number; digits: { idx: number; digit: string }[] }[] = []
    for (const p of pattern) {
      const need = p.count
      const remaining = 3 - offsetInGroup
      const take = Math.min(need, remaining, decimalDigits.length - di)
      if (take <= 0) continue
      segs.push({
        gi,
        digits: Array.from({ length: take }, (_, j) => ({
          idx: di + j + 1,
          digit: decimalDigits[di + j],
        })),
      })
      di += take
      offsetInGroup += take
      if (offsetInGroup >= 3) {
        gi++
        offsetInGroup = 0
      }
    }
    rows.push({
      segs,
      isSectionEnd: di % 100 === 0 && di < decimalDigits.length,
    })
  }

  return (
    <div>
      <div class="pi-dot-cell">3.</div>
      <div class="pi-view-grid">
        {rows.map((row, ri) => (
          <div key={ri}>
            <div class="pi-view-row">
              {row.segs.map((seg, si) => {
                const n = seg.digits.length
                const spanCls = n === 3 ? 'full' : 'p' + n
                const isSelected =
                  selected !== null &&
                  Math.floor(selected / 2) === Math.floor(seg.gi / 2)
                return (
                  <div
                    key={si}
                    class={
                      'pi-view-seg ' + spanCls + (isSelected ? ' selected' : '')
                    }
                    onClick={() => {
                      const g = seg.gi
                      if (selected === g || (g > 0 && selected === g - 1)) {
                        onSelect(Math.floor(g / 2) * 2)
                      } else {
                        onSelect(g)
                      }
                    }}
                  >
                    {seg.digits.map((c) => (
                      <span
                        key={c.idx}
                        class="pi-view-d"
                        style={{ color: DIGIT_COLORS[Number(c.digit)] }}
                      >
                        {c.digit}
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
            {row.isSectionEnd && <div class="pi-section-divider" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function PiTab({ numbers, bookmarks, onToggleBm, onCheckingChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [checkPos, setCheckPos] = useState(1)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const storageKey = 'pi1000'
  const choiceStorageKey = 'pi1000choice'
  const [records, setRecords] = useState<Record[]>(() =>
    loadPiRecords(storageKey)
  )
  const [choiceRecords, setChoiceRecords] = useState<Record[]>(() =>
    loadPiRecords(choiceStorageKey)
  )
  const [finished, setFinished] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [recordsKind, setRecordsKind] = useState<'check' | 'choice'>('check')
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState({ score: 0, total: 0, time: 0 })

  // 4択モード state
  const [choicePos, setChoicePos] = useState(0)
  const [choiceAnswers, setChoiceAnswers] = useState<ChoiceAnswer[]>([])
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>([])
  const [choiceVariant, setChoiceVariant] = useState<ChoiceVariant>('full')

  const digits = PI_1000_DIGITS
  const totalDigits = 1000
  const chunkCount = Math.floor(totalDigits / 3) // 333

  const chunkAt = useCallback(
    (i: number) => digits.slice(1 + i * 3, 1 + i * 3 + 3).join(''),
    [digits]
  )

  const deleteRecord = useCallback(
    (idx: number) => {
      const key = recordsKind === 'choice' ? choiceStorageKey : storageKey
      const src = recordsKind === 'choice' ? choiceRecords : records
      const newRecords = src.filter((_, i) => i !== idx)
      if (recordsKind === 'choice') setChoiceRecords(newRecords)
      else setRecords(newRecords)
      savePiRecords(newRecords, key)
    },
    [recordsKind, records, choiceRecords, storageKey, choiceStorageKey]
  )

  const clearRecords = useCallback(() => {
    const key = recordsKind === 'choice' ? choiceStorageKey : storageKey
    if (recordsKind === 'choice') setChoiceRecords([])
    else setRecords([])
    savePiRecords([], key)
  }, [recordsKind, storageKey, choiceStorageKey])

  const startCheck = useCallback(() => {
    setMode('check')
    setCheckPos(1)
    setAnswers([])
    setStartTime(Date.now())
    setFinished(false)
    setSelected(null)
    onCheckingChange && onCheckingChange(true)
  }, [onCheckingChange])

  const startChoice = useCallback(
    (variant: ChoiceVariant) => {
      setMode('choice')
      setChoiceVariant(variant)
      setChoicePos(0)
      setChoiceAnswers([])
      setChoiceOptions(genChoiceOptions(chunkAt(0), variant))
      setStartTime(Date.now())
      setFinished(false)
      setSelected(null)
      onCheckingChange && onCheckingChange(true)
    },
    [chunkAt, onCheckingChange]
  )

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

  const endChoice = useCallback(
    (finalAnswers?: ChoiceAnswer[]) => {
      const used = finalAnswers || choiceAnswers
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
      const newRecords = [record, ...choiceRecords].slice(0, 50)
      setChoiceRecords(newRecords)
      savePiRecords(newRecords, choiceStorageKey)

      const items: ReviewItem[] = used.map((a) => {
        const pos = a.idx * 3 + 1
        return {
          label: `${pos}-${pos + 2}桁`,
          correct: a.correct,
          userAnswer: a.correct ? undefined : a.picked,
          rightAnswer: chunkAt(a.idx),
        }
      })
      setReviewItems(items)
      setReviewMeta({ score: correctCount, total: used.length, time: elapsed })

      setMode('view')
      setFinished(true)
      onCheckingChange && onCheckingChange(false)
    },
    [
      startTime,
      choiceAnswers,
      choiceRecords,
      choiceStorageKey,
      chunkAt,
      onCheckingChange,
    ]
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

  // 入力ミス訂正: 直前の入力を1つ取り消して入力位置を戻す
  const tapBackspace = useCallback(() => {
    if (mode !== 'check' || finished) return
    if (answers.length === 0) return
    const last = answers[answers.length - 1]
    setAnswers(answers.slice(0, -1))
    setCheckPos(last.idx)
  }, [mode, finished, answers])

  const pickChoice = useCallback(
    (value: string) => {
      if (mode !== 'choice' || finished) return
      const isCorrect = value === chunkAt(choicePos)
      const newAnswers = [
        ...choiceAnswers,
        { idx: choicePos, picked: value, correct: isCorrect },
      ]
      setChoiceAnswers(newAnswers)
      const next = choicePos + 1
      if (next >= chunkCount) {
        endChoice(newAnswers)
        return
      }
      setChoicePos(next)
      setChoiceOptions(genChoiceOptions(chunkAt(next), choiceVariant))
    },
    [
      mode,
      finished,
      choicePos,
      choiceAnswers,
      chunkAt,
      chunkCount,
      choiceVariant,
      endChoice,
    ]
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
      const startIdx = 1 + g * 3
      const numStr = digits.slice(startIdx, startIdx + 3).join('')
      if (numStr.length < 3) break
      const found = numbers.find((d) => d.num === numStr)
      if (found) result.push(found)
    }
    return result.length > 0 ? result : null
  }, [selected, numbers, digits])

  const openRecords = useCallback((kind: 'check' | 'choice') => {
    setRecordsKind(kind)
    setShowRecords(true)
  }, [])

  return (
    <div class="pi-layout">
      <PiHeader
        mode={mode}
        lastRecord={lastRecord}
        bestRecord={bestRecord}
        finished={finished}
        hasRecords={records.length > 0}
        hasChoiceRecords={choiceRecords.length > 0}
        checkPos={checkPos}
        answers={answers}
        choicePos={choicePos}
        choiceAnswers={choiceAnswers}
        chunkCount={chunkCount}
        onStartCheck={startCheck}
        onStartChoice={startChoice}
        onEndCheck={() => endCheck()}
        onEndChoice={() => endChoice()}
        onShowRecords={() => openRecords('check')}
        onShowChoiceRecords={() => openRecords('choice')}
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
          title={recordsKind === 'choice' ? 'π 4択' : 'π'}
          records={recordsKind === 'choice' ? choiceRecords : records}
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
          justifyContent: mode === 'view' ? 'flex-start' : 'flex-end',
        }}
      >
        {mode === 'check' ? (
          <PiCheckGrid
            answers={answers}
            checkPos={checkPos}
            digits={digits}
            totalDigits={totalDigits}
            compact
          />
        ) : mode === 'choice' ? (
          <PiChoiceProgress
            answers={choiceAnswers}
            choicePos={choicePos}
            chunkAt={chunkAt}
            chunkCount={chunkCount}
          />
        ) : (
          <PiViewGroups
            selected={selected}
            onSelect={setSelected}
            digits={digits}
          />
        )}
      </div>
      {mode === 'check' ? (
        <Numpad
          onTapDigit={tapDigit}
          colored
          onBackspace={tapBackspace}
          backspaceDisabled={answers.length === 0}
        />
      ) : mode === 'choice' ? (
        <PiChoiceOptions options={choiceOptions} onPick={pickChoice} />
      ) : null}
    </div>
  )
}

type PiHeaderProps = {
  mode: Mode
  lastRecord: Record | null
  bestRecord: Record | null
  finished: boolean
  hasRecords: boolean
  hasChoiceRecords: boolean
  checkPos: number
  answers: Answer[]
  choicePos: number
  choiceAnswers: ChoiceAnswer[]
  chunkCount: number
  onStartCheck: () => void
  onStartChoice: (variant: ChoiceVariant) => void
  onEndCheck: () => void
  onEndChoice: () => void
  onShowRecords: () => void
  onShowChoiceRecords: () => void
}

function PiHeader({
  mode,
  lastRecord,
  bestRecord,
  finished,
  hasRecords,
  hasChoiceRecords,
  checkPos,
  answers,
  choicePos,
  choiceAnswers,
  chunkCount,
  onStartCheck,
  onStartChoice,
  onEndCheck,
  onEndChoice,
  onShowRecords,
  onShowChoiceRecords,
}: PiHeaderProps) {
  return (
    <div class="pi-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div class="pi-header-title">π 円周率</div>
        <div class="pi-header-sub">1000桁</div>
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
              {hasRecords ? (
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
              {hasChoiceRecords ? (
                <button
                  class="filter-btn"
                  style={{
                    fontSize: '11px',
                    minWidth: '40px',
                    padding: '4px 8px',
                  }}
                  onClick={onShowChoiceRecords}
                >
                  4択記録
                </button>
              ) : null}
              <button
                class="filter-btn"
                style={{
                  fontSize: '12px',
                  minWidth: '50px',
                  padding: '4px 10px',
                }}
                onClick={() => onStartChoice('full')}
              >
                4択
              </button>
              <button
                class="filter-btn"
                style={{
                  fontSize: '12px',
                  minWidth: '56px',
                  padding: '4px 10px',
                }}
                onClick={() => onStartChoice('masked')}
              >
                虫食い
              </button>
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
          ) : mode === 'check' ? (
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
          ) : (
            <>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--accent)',
                  fontFamily: 'monospace',
                }}
              >
                {choicePos + 1}/{chunkCount}{' '}
                {choiceAnswers.filter((a) => a.correct).length}/
                {choiceAnswers.length}
              </span>
              <button
                class="filter-btn"
                style={{
                  fontSize: '12px',
                  minWidth: '50px',
                  padding: '4px 10px',
                }}
                onClick={onEndChoice}
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
