import { useState, useMemo, useCallback } from 'preact/hooks'
import type { NumberEntry, RulesData, YomiUse } from '../data/schema'
import KeypadQuiz from './KeypadQuiz'
import ChoiceQuiz, { type QuizSummary } from './ChoiceQuiz'
import ReviewPanel from './ReviewPanel'
import RecordPanel from './RecordPanel'
import TestFeatureList from './TestFeatureList'
import Screen, { DockRow } from './Screen'
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
import { layoutYomi, VOWEL_LABELS } from '../lib/yomiLayout'

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
      <Screen
        main={
          <div class="screen-empty">
            読みの表 (rules) が配信データに入っていません。`nr build:data`
            で再生成してください。
          </div>
        }
      />
    )
  }

  const assigned = scoped.filter((i) => i.nums.length > 0).length
  const totalAssign = scoped.reduce((sum, i) => sum + i.nums.length, 0)

  const toggle = (kana: string) =>
    setOpened((prev) => (prev === kana ? null : kana))

  // 読みの一覧は参照用なので main (下から上へ)。範囲・出題数と開始は dock。
  // 拗音と長音は行の立て方が違う (頭のかな / 行) ので表を分ける
  const main = (
    <div class="stack-up" style={{ '--stack-gap': '8px' }}>
      <div class="section-label">
        {scoped.length} 個中 {assigned} 個が使用中 (割当 {totalAssign} 番号)。
        タップで割当先の番号を表示。
      </div>
      {YOMI_KINDS.map((kind) => {
        const ofKind = scoped.filter((i) => i.kind === kind)
        if (ofKind.length === 0) return null
        return (
          <YomiTable
            key={kind}
            title={YOMI_SCOPE_LABEL[kind]}
            items={ofKind}
            opened={opened}
            onToggle={toggle}
          />
        )
      })}
    </div>
  )

  const dock = (
    <>
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
    </>
  )

  return <Screen main={main} dock={dock} />
}

type ChipOption = {
  key: string
  label: string
  active: boolean
  onSelect: () => void
}

function ChipRow({ label, options }: { label: string; options: ChipOption[] }) {
  return (
    <DockRow>
      <span class="dock-row-label">{label}</span>
      {options.map((o) => (
        <button
          key={o.key}
          class={'filter-btn' + (o.active ? ' active' : '')}
          onClick={o.onSelect}
        >
          {o.label}
        </button>
      ))}
    </DockRow>
  )
}

/** 表の並び (拗音 → 長音)。1 列目が行の名前、残り 5 列が あいうえお の段 */
const YOMI_KINDS = ['youon', 'long'] as const
const TABLE_COLS = 1 + VOWEL_LABELS.length

/**
 * 五十音表のように並べた 2文字読み。grid-up は下から積むので、
 * 段の見出しを先頭 (= 親指側の一番下) に置き、行は五十音順に上へ伸びる。
 * 開いた読みの詳細はセルを広げず行の直後に 1 行で出す (段の位置を崩さないため)
 */
function YomiTable({
  title,
  items,
  opened,
  onToggle,
}: {
  title: string
  items: YomiItem[]
  opened: string | null
  onToggle: (kana: string) => void
}) {
  const { rows, unplaced } = layoutYomi(items)
  const openedItem = items.find((i) => i.kana === opened)
  return (
    <div class="stack-up" style={{ '--stack-gap': '4px' }}>
      <div class="section-label">{title}</div>
      <div class="grid-up" style={{ '--cols': TABLE_COLS, '--gap': '6px' }}>
        <div />
        {VOWEL_LABELS.map((v) => (
          <div key={v} class="section-label" style={{ textAlign: 'center' }}>
            {v}
          </div>
        ))}
        {rows.flatMap((row) => [
          <div
            key={row.key}
            class="section-label"
            style={{ alignSelf: 'center', textAlign: 'center' }}
          >
            {row.label}
          </div>,
          ...row.cells.map((cell, i) =>
            cell ? (
              <YomiCell
                key={cell.kana}
                item={cell}
                open={opened === cell.kana}
                onToggle={() => onToggle(cell.kana)}
              />
            ) : (
              <div key={`${row.key}-${i}`} />
            )
          ),
          openedItem && row.cells.includes(openedItem) ? (
            <YomiDetail key={`${row.key}-detail`} item={openedItem} />
          ) : null,
        ])}
      </div>
      {/* 表に置けない並び (将来の表追加など) も落とさず見せる */}
      {unplaced.length > 0 && (
        <div class="grid-up" style={{ '--cols': TABLE_COLS, '--gap': '6px' }}>
          {unplaced.map((item) => (
            <YomiCell
              key={item.kana}
              item={item}
              open={opened === item.kana}
              onToggle={() => onToggle(item.kana)}
            />
          ))}
          {openedItem && unplaced.includes(openedItem) ? (
            <YomiDetail item={openedItem} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function YomiDetail({ item }: { item: YomiItem }) {
  return (
    <div
      class="grid-full"
      style={{
        fontSize: 12,
        color: 'var(--text2)',
        fontFamily: 'var(--font-mono)',
        wordBreak: 'break-all',
        padding: '4px 6px',
      }}
    >
      {item.kana} {item.digits}:{' '}
      {item.nums.length > 0 ? item.nums.join(' ') : usageNote(item)}
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
  // 割当 0 は «まだ使っていない読み»。一覧で使用中と見分けられるよう沈める。
  // 開いたときは選択中と分かるよう濃さを戻す
  const isInactive = !used && !open
  return (
    <div
      onClick={onToggle}
      style={{
        border: `1px ${isInactive ? 'dashed' : 'solid'} ${
          open ? 'var(--accent)' : 'var(--line, rgba(255,255,255,.12))'
        }`,
        borderRadius: 10,
        padding: '8px 6px',
        textAlign: 'center',
        cursor: 'pointer',
        background: isInactive ? 'transparent' : 'var(--surface2, transparent)',
        opacity: isInactive ? 0.4 : 1,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700 }}>{item.kana}</div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          color: used ? 'var(--accent)' : 'var(--text2)',
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
    </div>
  )
}

export default YomiTab
