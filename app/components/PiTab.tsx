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
import TestFeatureList from './TestFeatureList'
import MarkButton from './MarkButton'
import Screen, { DockBar, PanelCards, QuitButton } from './Screen'
import { useReviewMarks, applyMarks } from '../lib/reviewMarks'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

// 振り返り行の label と同じ文字列。印はこれで問題を識別する
const digitLabel = (idx: number) => `${idx + 1}桁目`
const chunkLabel = (idx: number) => {
  const pos = idx * 3 + 1
  return `${pos}-${pos + 2}桁`
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

  // 1 桁目のブロックを下端 (親指側) に置き上へ積む。見出しは各ブロックの下
  return (
    <div
      class={`pi-check-grid stack-up${compact ? ' compact' : ''}`}
      style={{ '--stack-gap': '8px' }}
    >
      {blocks.map((block) => (
        <div key={block.start} class="stack-up">
          {blocks.length > 1 && (
            <div class="pi-block-label">
              {String(block.start + 1).padStart(3, '0')}–
              {String(block.start + block.digits.length).padStart(3, '0')}
            </div>
          )}
          <div
            class="pi-block-grid grid-up"
            style={{ '--cols': 25, '--gap': '1px' }}
          >
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
    <div
      class="pi-check-grid stack-up compact"
      style={{ '--stack-gap': '8px' }}
    >
      {blocks.map((block) => (
        <div key={block.start} class="stack-up">
          <div class="pi-block-label">
            {String(block.start + 1).padStart(3, '0')}–
            {String(block.start + block.digits.length).padStart(3, '0')}
          </div>
          <div
            class="pi-block-grid grid-up"
            style={{ '--cols': 25, '--gap': '1px' }}
          >
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
    <div>
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

  // 1 行目 (3.14…) を下端に置き上へ積む。「3.」はその下
  return (
    <div class="stack-up">
      <div class="pi-dot-cell">3.</div>
      <div class="pi-view-grid stack-up">
        {rows.map((row, ri) => (
          <div key={ri}>
            {/* 逆順に積むので、100 桁の区切りは区切り行の «上» (次の行との間) に置く */}
            {row.isSectionEnd && <div class="pi-section-divider" />}
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
          </div>
        ))}
      </div>
    </div>
  )
}

// bookmarks / onToggleBm は NumDetailPanel が NumberContext から取るので使わない
function PiTab({ numbers }: Props) {
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
  const marks = useReviewMarks()

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
    marks.reset()
  }, [marks.reset])

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
      marks.reset()
    },
    [chunkAt, marks.reset]
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
        return {
          label: digitLabel(a.idx),
          correct: a.correct,
          userAnswer: a.correct ? undefined : a.digit,
          rightAnswer: digits[a.idx],
        }
      })
      setReviewItems(applyMarks(items, marks.marks))
      setReviewMeta({ score: correctCount, total: used.length, time: elapsed })

      setMode('view')
      setFinished(true)
    },
    [startTime, answers, records, storageKey, digits, marks.marks]
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
        const chunk = chunkAt(a.idx)
        return {
          label: chunkLabel(a.idx),
          correct: a.correct,
          userAnswer: a.correct ? undefined : a.picked,
          rightAnswer: chunk,
          num: /^\d{3}$/.test(chunk) ? chunk : undefined,
        }
      })
      setReviewItems(applyMarks(items, marks.marks))
      setReviewMeta({ score: correctCount, total: used.length, time: elapsed })

      setMode('view')
      setFinished(true)
    },
    [startTime, choiceAnswers, choiceVariant, storeOf, chunkAt, marks.marks]
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

  const isTest = mode !== 'view'

  const main =
    mode === 'check' ? (
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
    )

  const panel =
    mode === 'view' && selectedPair ? (
      <>
        <PanelCards>
          {selectedPair.map((d) => (
            <NumDetailPanel key={d.num} d={d} />
          ))}
        </PanelCards>
        {/* 複数枚まとめて 1 つの閉じる。詳細カード側は閉じるを持たない */}
        <div class="panel-foot">
          <button class="btn-wide" onClick={() => setSelected(null)}>
            閉じる
          </button>
        </div>
      </>
    ) : null

  const dock = (
    <>
      <PiDockBar
        mode={mode}
        lastRecord={lastRecord}
        bestRecord={bestRecord}
        finished={finished}
        checkPos={checkPos}
        answers={answers}
        choicePos={choicePos}
        choiceAnswers={choiceAnswers}
        chunkCount={chunkCount}
        onEndCheck={() => endCheck()}
        onEndChoice={() => endChoice()}
        markLabel={
          mode === 'check'
            ? digitLabel(checkPos)
            : mode === 'choice'
            ? chunkLabel(choicePos)
            : null
        }
        marks={marks.marks}
        onToggleMark={marks.toggle}
      />
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
      ) : (
        <TestFeatureList
          features={[
            {
              id: 'pi-check',
              title: 'テスト',
              inputMethod: 'number',
              onStart: startCheck,
              hasRecords: records.length > 0,
              onShowRecords: () => openRecords('check'),
            },
            {
              id: 'pi-choice',
              title: '4択',
              inputMethod: 'choice',
              onStart: () => startChoice('full'),
              hasRecords: choiceRecords.length > 0,
              onShowRecords: () => openRecords('choice'),
            },
            {
              id: 'pi-masked',
              title: '虫食い',
              inputMethod: 'choice',
              onStart: () => startChoice('masked'),
              hasRecords: maskedRecords.length > 0,
              onShowRecords: () => openRecords('masked'),
            },
          ]}
        />
      )}
    </>
  )

  return (
    <>
      <Screen isTest={isTest} main={main} panel={panel} dock={dock} />
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
    </>
  )
}

type PiDockBarProps = {
  mode: Mode
  lastRecord: Record | null
  bestRecord: Record | null
  finished: boolean
  checkPos: number
  answers: Answer[]
  choicePos: number
  choiceAnswers: ChoiceAnswer[]
  chunkCount: number
  onEndCheck: () => void
  onEndChoice: () => void
  /** 今の問題の印キー (振り返り行の label)。テスト中でなければ null */
  markLabel: string | null
  marks: Set<string>
  onToggleMark: (label: string) => void
}

// dock の 1 行目 (旧 PiHeader)。テスト中は進捗・印・終了を右端に寄せる
function PiDockBar({
  mode,
  lastRecord,
  bestRecord,
  finished,
  checkPos,
  answers,
  choicePos,
  choiceAnswers,
  chunkCount,
  onEndCheck,
  onEndChoice,
  markLabel,
  marks,
  onToggleMark,
}: PiDockBarProps) {
  if (mode === 'view') {
    return (
      <DockBar
        title="π 円周率"
        sub={
          <>
            1000桁
            {lastRecord || finished ? (
              <RecordSummary last={lastRecord} best={bestRecord} />
            ) : null}
          </>
        }
      />
    )
  }

  const progress =
    mode === 'check'
      ? `${checkPos - 1}桁目 ${answers.filter((a) => a.correct).length}/${
          answers.length
        }`
      : `${choicePos + 1}/${chunkCount} ${
          choiceAnswers.filter((a) => a.correct).length
        }/${choiceAnswers.length}`

  return (
    <DockBar title="π 円周率" sub="1000桁">
      <span class="dock-progress">{progress}</span>
      {!finished && markLabel ? (
        <MarkButton
          on={marks.has(markLabel)}
          onToggle={() => onToggleMark(markLabel)}
        />
      ) : null}
      <QuitButton onClick={mode === 'check' ? onEndCheck : onEndChoice} />
    </DockBar>
  )
}

function RecordSummary({
  last,
  best,
}: {
  last: Record | null
  best: Record | null
}) {
  return (
    <span class="dock-rec">
      {last ? (
        <>
          前回:
          <b>
            {last.score}/{last.total}
          </b>
        </>
      ) : null}
      {best ? (
        <>
          {' '}
          最高:
          <b class="is-best">
            {best.score}/{best.total}
          </b>
        </>
      ) : null}
    </span>
  )
}

export default PiTab
