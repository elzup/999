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
}

type Answer = { idx: number; digit: string; correct: boolean }
type ChoiceAnswer = { idx: number; picked: string; correct: boolean }
type Mode = 'view' | 'check' | 'choice'
type RecordKind = 'check' | 'choice' | 'masked'

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

// テストモードと同じ 25 列グリッドで、3 桁チャンク単位の正誤を桁ごとに色付け表示
function PiChoiceGrid({
  answers,
  choicePos,
  digits,
  chunkCount,
}: {
  answers: ChoiceAnswer[]
  choicePos: number
  digits: string[]
  chunkCount: number
}) {
  const totalDigits = chunkCount * 3
  const decimalDigits = digits.slice(1, totalDigits + 1)
  const blockSize = 100
  const blocks: { start: number; digits: string[] }[] = []
  for (let s = 0; s < decimalDigits.length; s += blockSize) {
    blocks.push({ start: s, digits: decimalDigits.slice(s, s + blockSize) })
  }

  return (
    <div class="pi-check-grid compact">
      {blocks.map((block) => (
        <div key={block.start}>
          <div class="pi-block-label">
            {String(block.start + 1).padStart(3, '0')}–
            {String(block.start + block.digits.length).padStart(3, '0')}
          </div>
          <div class="pi-block-grid">
            {block.digits.map((d, j) => {
              const idx = block.start + j + 1
              const chunk = Math.floor((idx - 1) / 3)
              const posInChunk = (idx - 1) % 3
              const answered = answers.find((a) => a.idx === chunk)
              const isCurrent = chunk === choicePos
              const cls =
                'pi-check-cell' +
                (isCurrent ? ' current' : '') +
                (answered
                  ? answered.correct
                    ? ' correct'
                    : ' wrong'
                  : !answered && chunk > choicePos
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
                      {answered.correct ? d : answered.picked[posInChunk]}
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

function PiChoiceOptions({
  options,
  onPick,
  onBack,
  backDisabled,
}: {
  options: ChoiceOption[]
  onPick: (value: string) => void
  onBack: () => void
  backDisabled: boolean
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
      <button
        class="pi-choice-back"
        disabled={backDisabled}
        onClick={() => {
          vibrate()
          onBack()
        }}
      >
        ⌫ 戻る
      </button>
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

function PiTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [checkPos, setCheckPos] = useState(1)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const storageKey = 'pi1000'
  const choiceStorageKey = 'pi1000choice'
  const maskedStorageKey = 'pi1000masked'
  const [records, setRecords] = useState<Record[]>(() =>
    loadPiRecords(storageKey)
  )
  const [choiceRecords, setChoiceRecords] = useState<Record[]>(() =>
    loadPiRecords(choiceStorageKey)
  )
  const [maskedRecords, setMaskedRecords] = useState<Record[]>(() =>
    loadPiRecords(maskedStorageKey)
  )
  const [finished, setFinished] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [recordsKind, setRecordsKind] = useState<RecordKind>('check')
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

  const storeOf = useCallback(
    (kind: RecordKind) => {
      if (kind === 'masked')
        return {
          key: maskedStorageKey,
          list: maskedRecords,
          set: setMaskedRecords,
        }
      if (kind === 'choice')
        return {
          key: choiceStorageKey,
          list: choiceRecords,
          set: setChoiceRecords,
        }
      return { key: storageKey, list: records, set: setRecords }
    },
    [
      records,
      choiceRecords,
      maskedRecords,
      storageKey,
      choiceStorageKey,
      maskedStorageKey,
    ]
  )

  const deleteRecord = useCallback(
    (idx: number) => {
      const store = storeOf(recordsKind)
      const newRecords = store.list.filter((_, i) => i !== idx)
      store.set(newRecords)
      savePiRecords(newRecords, store.key)
    },
    [recordsKind, storeOf]
  )

  const clearRecords = useCallback(() => {
    const store = storeOf(recordsKind)
    store.set([])
    savePiRecords([], store.key)
  }, [recordsKind, storeOf])

  const startCheck = useCallback(() => {
    setMode('check')
    setCheckPos(1)
    setAnswers([])
    setStartTime(Date.now())
    setFinished(false)
    setSelected(null)
  }, [])

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
    },
    [chunkAt]
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
    },
    [startTime, answers, records, storageKey, digits]
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
      // 4択(full) と 虫食い(masked) は別々に記録を残す
      const store = storeOf(choiceVariant === 'masked' ? 'masked' : 'choice')
      const newRecords = [record, ...store.list].slice(0, 50)
      store.set(newRecords)
      savePiRecords(newRecords, store.key)

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
    },
    [startTime, choiceAnswers, choiceVariant, storeOf, chunkAt]
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

  // 4択も直前の選択を1つ取り消して戻れる (お堅いテストではないので)
  const choiceBack = useCallback(() => {
    if (mode !== 'choice' || finished) return
    if (choiceAnswers.length === 0) return
    const last = choiceAnswers[choiceAnswers.length - 1]
    setChoiceAnswers(choiceAnswers.slice(0, -1))
    setChoicePos(last.idx)
    setChoiceOptions(genChoiceOptions(chunkAt(last.idx), choiceVariant))
  }, [mode, finished, choiceAnswers, chunkAt, choiceVariant])

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

  const openRecords = useCallback((kind: RecordKind) => {
    setRecordsKind(kind)
    setShowRecords(true)
  }, [])

  const recordTitle = { check: 'π', choice: 'π 4択', masked: 'π 虫食い' }

  return (
    <div class={'pi-layout' + (mode !== 'view' ? ' test-screen' : '')}>
      <PiHeader
        mode={mode}
        lastRecord={lastRecord}
        bestRecord={bestRecord}
        finished={finished}
        hasRecords={records.length > 0}
        hasChoiceRecords={choiceRecords.length > 0}
        hasMaskedRecords={maskedRecords.length > 0}
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
        onShowMaskedRecords={() => openRecords('masked')}
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
          title={recordTitle[recordsKind]}
          records={storeOf(recordsKind).list}
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
          <PiChoiceGrid
            answers={choiceAnswers}
            choicePos={choicePos}
            digits={digits}
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
        <PiChoiceOptions
          options={choiceOptions}
          onPick={pickChoice}
          onBack={choiceBack}
          backDisabled={choiceAnswers.length === 0}
        />
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
  hasMaskedRecords: boolean
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
  onShowMaskedRecords: () => void
}

function PiHeader({
  mode,
  lastRecord,
  bestRecord,
  finished,
  hasRecords,
  hasChoiceRecords,
  hasMaskedRecords,
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
  onShowMaskedRecords,
}: PiHeaderProps) {
  return (
    <div class="pi-header">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          rowGap: '6px',
        }}
      >
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
              {[
                {
                  label: 'テスト',
                  onStart: onStartCheck,
                  hasRec: hasRecords,
                  onRec: onShowRecords,
                },
                {
                  label: '4択',
                  onStart: () => onStartChoice('full'),
                  hasRec: hasChoiceRecords,
                  onRec: onShowChoiceRecords,
                },
                {
                  label: '虫食い',
                  onStart: () => onStartChoice('masked'),
                  hasRec: hasMaskedRecords,
                  onRec: onShowMaskedRecords,
                },
              ].map((m) => (
                <div key={m.label} class="pi-mode-group">
                  <button class="pi-mode-start" onClick={m.onStart}>
                    {m.label}
                  </button>
                  {m.hasRec ? (
                    <button
                      class="pi-mode-rec"
                      title={`${m.label}の記録`}
                      onClick={m.onRec}
                    >
                      記録
                    </button>
                  ) : null}
                </div>
              ))}
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
