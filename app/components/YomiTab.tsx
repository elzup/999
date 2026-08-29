import { useState, useMemo, useCallback } from 'preact/hooks'
import type { NumberEntry, RulesData, YomiUse } from '../data/schema'
import KeypadQuiz from './KeypadQuiz'
import ChoiceQuiz, { type QuizSummary } from './ChoiceQuiz'
import ReviewPanel from './ReviewPanel'
import RecordPanel from './RecordPanel'
import TestFeatureList from './TestFeatureList'
import { useQuizRecords } from '../lib/useQuizRecords'
import { makeRng } from '../lib/kukuQuiz'
import {
  buildYomiItems,
  buildYomiQuestions,
  buildYomiWordQuestions,
  yomiWordPool,
  filterScope,
  usageNote,
  YOMI_COUNT_OPTIONS,
  YOMI_SCOPES,
  YOMI_SCOPE_LABEL,
  yomiCountLabel,
  type YomiItem,
  type YomiScope,
} from '../lib/yomiDrill'

type Props = {
  numbers: NumberEntry[]
  rules?: RulesData
  yomiUse?: YomiUse
}

/** 出題の向き。digit = 読み→数字 (テンキー) / word = 番号→語 (4択) */
type QuizKind = 'digit' | 'word'

const RECORD_KEY: Record<QuizKind, string> = {
  digit: 'yomi_2char',
  word: 'yomi_word4',
}

const TITLE = '2文字読み'

const QUIZ_TITLE: Record<QuizKind, string> = {
  digit: `${TITLE} → 数字`,
  word: `番号 → 語 (${TITLE})`,
}

type Run =
  | { kind: 'digit'; id: number; qs: ReturnType<typeof buildYomiQuestions> }
  | { kind: 'word'; id: number; qs: ReturnType<typeof buildYomiWordQuestions> }

function YomiTab({ numbers, rules, yomiUse }: Props) {
  const [scope, setScope] = useState<YomiScope>('all')
  const [count, setCount] = useState<number>(0)
  const [opened, setOpened] = useState<string | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState<QuizKind | null>(null)
  const digitRecords = useQuizRecords(RECORD_KEY.digit)
  const wordRecords = useQuizRecords(RECORD_KEY.word)

  const items = useMemo(() => buildYomiItems(rules, yomiUse), [rules, yomiUse])
  const scoped = useMemo(() => filterScope(items, scope), [items, scope])
  // 範囲内の読みを使う語。空なら 4択は成立しない (選択肢が作れない)。
  const wordPool = useMemo(
    () => yomiWordPool(numbers, scoped),
    [numbers, scoped]
  )

  const startDigit = useCallback(() => {
    setSummary(null)
    setRun((prev) => ({
      kind: 'digit',
      id: (prev?.id ?? 0) + 1,
      qs: buildYomiQuestions(scoped, count),
    }))
  }, [scoped, count])

  const startWord = useCallback(() => {
    const qs = buildYomiWordQuestions(wordPool, count, makeRng(Date.now()))
    if (qs.length === 0) return
    setSummary(null)
    setRun((prev) => ({ kind: 'word', id: (prev?.id ?? 0) + 1, qs }))
  }, [wordPool, count])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      if (!run) return
      const target = run.kind === 'digit' ? digitRecords : wordRecords
      target.addRecord(s)
    },
    [run, digitRecords, wordRecords]
  )

  const recordsOf = (kind: QuizKind) =>
    kind === 'digit' ? digitRecords : wordRecords
  // 出題数チップは「全部 (0)」を範囲の全件として扱う。
  const askCount = (poolSize: number) =>
    count === 0 ? poolSize : Math.min(count, poolSize)

  if (run && summary) {
    return (
      <ReviewPanel
        title={QUIZ_TITLE[run.kind]}
        score={summary.score}
        total={summary.total}
        time={summary.time}
        items={summary.reviews}
        onClose={() => {
          setRun(null)
          setSummary(null)
        }}
      />
    )
  }

  if (run && run.kind === 'word') {
    return (
      <ChoiceQuiz
        key={run.id}
        title={QUIZ_TITLE.word}
        questions={run.qs}
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  if (run) {
    return (
      <KeypadQuiz
        key={run.id}
        title={QUIZ_TITLE.digit}
        pad="dec"
        questions={run.qs}
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  if (items.length === 0) {
    return (
      <div class="content" style={{ padding: 24, color: 'var(--text2)' }}>
        読みの表 (rules) が配信データに入っていません。`nr build:data`
        で再生成してください。
      </div>
    )
  }

  const assigned = scoped.filter((i) => i.nums.length > 0).length
  const totalAssign = scoped.reduce((sum, i) => sum + i.nums.length, 0)

  return (
    <div class="content">
      {showRecords && (
        <RecordPanel
          title={QUIZ_TITLE[showRecords]}
          records={recordsOf(showRecords).records}
          onDelete={recordsOf(showRecords).deleteRecord}
          onClear={recordsOf(showRecords).clearRecords}
          onClose={() => setShowRecords(null)}
        />
      )}

      <ChipRow
        label="範囲"
        options={YOMI_SCOPES.map((s) => ({
          key: s,
          label: `${YOMI_SCOPE_LABEL[s]} ${filterScope(items, s).length}`,
          active: scope === s,
          onSelect: () => setScope(s),
        }))}
      />
      <ChipRow
        label="出題"
        options={YOMI_COUNT_OPTIONS.map((c) => ({
          key: String(c),
          label: yomiCountLabel(c),
          active: count === c,
          onSelect: () => setCount(c),
        }))}
      />

      <TestFeatureList
        features={[
          {
            id: 'yomi2digit',
            title: `読み → 数字 (${askCount(scoped.length)}問)`,
            inputMethod: 'number',
            hasRecords: digitRecords.records.length > 0,
            lastDone: Boolean(digitRecords.last),
            onStart: startDigit,
            onShowRecords: () => setShowRecords('digit'),
          },
          {
            id: 'yomiWord4',
            title: `番号 → 語 4択 (${askCount(wordPool.length)}問)`,
            inputMethod: 'choice',
            hasRecords: wordRecords.records.length > 0,
            lastDone: Boolean(wordRecords.last),
            onStart: startWord,
            onShowRecords: () => setShowRecords('word'),
          },
        ]}
      />

      <div
        style={{
          fontSize: 12,
          color: 'var(--text2)',
          margin: '14px 2px 6px',
        }}
      >
        {scoped.length} 個中 {assigned} 個が使用中 (割当 {totalAssign} 番号)。
        タップで割当先の番号を表示。
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
          gap: 8,
          paddingBottom: 24,
        }}
      >
        {scoped.map((item) => (
          <YomiCell
            key={item.kana}
            item={item}
            open={opened === item.kana}
            onToggle={() =>
              setOpened((prev) => (prev === item.kana ? null : item.kana))
            }
          />
        ))}
      </div>
    </div>
  )
}

type ChipOption = {
  key: string
  label: string
  active: boolean
  onSelect: () => void
}

function ChipRow({ label, options }: { label: string; options: ChipOption[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '8px 0',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text2)', minWidth: 28 }}>
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.key}
          class={'filter-btn' + (o.active ? ' active' : '')}
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={o.onSelect}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function YomiCell({
  item,
  open,
  onToggle,
}: {
  item: YomiItem
  open: boolean
  onToggle: () => void
}) {
  const used = item.nums.length > 0
  return (
    <div
      onClick={onToggle}
      style={{
        border: `1px solid ${
          open ? 'var(--accent)' : 'var(--line, rgba(255,255,255,.12))'
        }`,
        borderRadius: 10,
        padding: '8px 6px',
        textAlign: 'center',
        cursor: 'pointer',
        gridColumn: open ? '1 / -1' : undefined,
        background: 'var(--surface2, transparent)',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700 }}>{item.kana}</div>
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 14,
          color: 'var(--accent)',
        }}
      >
        {item.digits}
      </div>
      <div
        style={{
          fontSize: 11,
          color: used ? 'var(--text2)' : 'var(--muted, #6b7280)',
        }}
      >
        割当 {item.nums.length}
      </div>
      {open && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text2)',
            marginTop: 6,
            fontFamily: 'ui-monospace, monospace',
            wordBreak: 'break-all',
          }}
        >
          {used ? item.nums.join(' ') : usageNote(item)}
        </div>
      )}
    </div>
  )
}

export default YomiTab
