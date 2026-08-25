import { useState, useMemo, useCallback } from 'preact/hooks'
import type { RulesData, YomiUse } from '../data/schema'
import KeypadQuiz from './KeypadQuiz'
import type { QuizSummary } from './ChoiceQuiz'
import ReviewPanel from './ReviewPanel'
import RecordPanel from './RecordPanel'
import TestFeatureList from './TestFeatureList'
import { useQuizRecords } from '../lib/useQuizRecords'
import {
  buildYomiItems,
  buildYomiQuestions,
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
  rules?: RulesData
  yomiUse?: YomiUse
}

const RECORD_KEY = 'yomi_2char'
const TITLE = '2文字読み'

function YomiTab({ rules, yomiUse }: Props) {
  const [scope, setScope] = useState<YomiScope>('all')
  const [count, setCount] = useState<number>(0)
  const [opened, setOpened] = useState<string | null>(null)
  const [run, setRun] = useState<{
    id: number
    qs: ReturnType<typeof buildYomiQuestions>
  } | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const records = useQuizRecords(RECORD_KEY)

  const items = useMemo(() => buildYomiItems(rules, yomiUse), [rules, yomiUse])
  const scoped = useMemo(() => filterScope(items, scope), [items, scope])

  const start = useCallback(() => {
    setSummary(null)
    setRun((prev) => ({
      id: (prev?.id ?? 0) + 1,
      qs: buildYomiQuestions(scoped, count),
    }))
  }, [scoped, count])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      records.addRecord(s)
    },
    [records]
  )

  if (run && summary) {
    return (
      <ReviewPanel
        title={TITLE}
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

  if (run) {
    return (
      <KeypadQuiz
        key={run.id}
        title={`${TITLE} → 数字`}
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
          title={TITLE}
          records={records.records}
          onDelete={records.deleteRecord}
          onClear={records.clearRecords}
          onClose={() => setShowRecords(false)}
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
            title: `読み → 数字 (${
              count === 0 ? scoped.length : Math.min(count, scoped.length)
            }問)`,
            inputMethod: 'number',
            hasRecords: records.records.length > 0,
            lastDone: Boolean(records.last),
            onStart: start,
            onShowRecords: () => setShowRecords(true),
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
