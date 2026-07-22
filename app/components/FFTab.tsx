import { useState, useCallback } from 'preact/hooks'
import TestFeatureList, { type TestFeatureAction } from './TestFeatureList'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import ReviewPanel from './ReviewPanel'
import RecordPanel from './RecordPanel'
import KeypadQuiz, { type KeypadQuestion } from './KeypadQuiz'
import { useQuizRecords } from '../lib/useQuizRecords'
import {
  FF_ROWS,
  FF_DIRS,
  buildFfQuestions,
  ffDirTitle,
  ffPromptClass,
  type FfDir,
  NIBBLE,
  NIBBLE_KINDS,
  buildNibble,
  type NibbleKind,
} from '../lib/ffQuiz'

type Sub = 'ref' | 'bin' | 'test'
export type FfRun =
  | { kind: 'ff'; dir: FfDir; questions: ChoiceQuestion[]; id: number }
  | {
      kind: 'kp'
      nibble: NibbleKind
      pad: 'hex' | 'bin'
      questions: KeypadQuestion[]
      id: number
    }

const TYPE_COLOR: Record<string, string> = {
  NN: 'var(--green, #34d399)',
  NC: 'var(--blue, #60a5fa)',
  CN: 'var(--amber, #fbbf24)',
  CC: 'var(--pink, #f472b6)',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 6,
        color: TYPE_COLOR[type] || 'var(--text2)',
        border: `1px solid ${TYPE_COLOR[type] || 'var(--line)'}`,
      }}
    >
      {type}
    </span>
  )
}

const mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

// テストID = FfDir | NibbleKind。各IDごとに記録(履歴/統計)を保存する。
export type TestId = FfDir | NibbleKind

type RecordSink = { addRecord: (summary: QuizSummary) => void }

export function completeFfRun(
  run: FfRun | null,
  summary: QuizSummary,
  records: Record<TestId, RecordSink>
) {
  if (!run) return
  const id: TestId = run.kind === 'kp' ? run.nibble : run.dir
  records[id].addRecord(summary)
}

function FFTab() {
  const [sub, setSub] = useState<Sub>('ref')
  const [run, setRun] = useState<FfRun | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState<TestId | null>(null)

  // 各テストの記録エンジン(他テストと同じ useQuizRecords / RecordPanel)。
  const recHex2read = useQuizRecords('ff_hex2read')
  const recRead2hex = useQuizRecords('ff_read2hex')
  const recBin2hex = useQuizRecords('ff_bin2hex')
  const recHex2bin = useQuizRecords('ff_hex2bin')
  const recB2h = useQuizRecords('ff_b2h')
  const recH2b = useQuizRecords('ff_h2b')
  const recOf: Record<TestId, ReturnType<typeof useQuizRecords>> = {
    hex2read: recHex2read,
    read2hex: recRead2hex,
    bin2hex: recBin2hex,
    hex2bin: recHex2bin,
    b2h: recB2h,
    h2b: recH2b,
  }
  const titleOf = (id: TestId): string =>
    id in NIBBLE ? NIBBLE[id as NibbleKind].title : ffDirTitle(id as FfDir)

  const startTest = useCallback((dir: FfDir) => {
    setSummary(null)
    setRun((prev) => ({
      kind: 'ff',
      dir,
      questions: buildFfQuestions(dir),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [])

  const startNibble = useCallback((kind: NibbleKind) => {
    setSummary(null)
    setRun((prev) => ({
      kind: 'kp',
      nibble: kind,
      pad: NIBBLE[kind].pad,
      questions: buildNibble(kind),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      completeFfRun(run, s, recOf)
    },
    [run, recOf]
  )

  const runTitle = run
    ? run.kind === 'kp'
      ? NIBBLE[run.nibble].title
      : `hex ${ffDirTitle(run.dir)}`
    : ''

  // 全問終了 → 結果オーバーレイ(他テストと同じ流れ)
  if (run && summary) {
    return (
      <ReviewPanel
        title={runTitle}
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

  if (run && run.kind === 'kp') {
    return (
      <KeypadQuiz
        key={run.id}
        title={runTitle}
        pad={run.pad}
        questions={run.questions}
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  if (run) {
    return (
      <ChoiceQuiz
        key={run.id}
        title={runTitle}
        questions={run.questions}
        promptClass={ffPromptClass(run.dir)}
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  // nibble(キーパッド) と語4択を同じ TestFeature 抽象に統一。記録も共通。
  const nibbleFeatures: TestFeatureAction[] = NIBBLE_KINDS.map((kind) => ({
    id: kind,
    title: NIBBLE[kind].title,
    inputMethod: 'number',
    hasRecords: recOf[kind].records.length > 0,
    onStart: () => startNibble(kind),
    onShowRecords: () => setShowRecords(kind),
  }))
  const choiceFeatures: TestFeatureAction[] = FF_DIRS.map((dir) => ({
    id: dir,
    title: ffDirTitle(dir),
    inputMethod: 'choice',
    hasRecords: recOf[dir].records.length > 0,
    onStart: () => startTest(dir),
    onShowRecords: () => setShowRecords(dir),
  }))

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
      <div class="sub-tab-switch">
        <button
          class={'sub-tab-btn' + (sub === 'ref' ? ' active' : '')}
          onClick={() => setSub('ref')}
        >
          確認
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'bin' ? ' active' : '')}
          onClick={() => setSub('bin')}
        >
          binary
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'test' ? ' active' : '')}
          onClick={() => setSub('test')}
        >
          テスト
        </button>
      </div>

      {sub === 'ref' && (
        <div class="content" style={{ padding: '8px 12px', overflow: 'auto' }}>
          {FF_ROWS.map((r) => (
            <div
              key={r.hex}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '5px 2px',
                borderBottom: '1px solid var(--line, rgba(255,255,255,.08))',
              }}
            >
              <span style={{ ...mono, fontWeight: 700, width: 28 }}>
                {r.hex}
              </span>
              <TypeBadge type={r.type} />
              <span style={{ ...mono, color: 'var(--text2)', width: 44 }}>
                {r.exp}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {r.word || '—'}
                {r.kana && r.kana !== r.word ? (
                  <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                    （{r.kana}）
                  </span>
                ) : null}
              </span>
              <span style={{ fontWeight: 700 }}>{r.read}</span>
            </div>
          ))}
        </div>
      )}

      {sub === 'bin' && (
        <div class="content" style={{ padding: '8px 12px', overflow: 'auto' }}>
          {FF_ROWS.map((r) => (
            <div
              key={r.hex}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                padding: '5px 2px',
                borderBottom: '1px solid var(--line, rgba(255,255,255,.08))',
              }}
            >
              <span style={{ ...mono, fontWeight: 700, width: 28 }}>
                {r.hex}
              </span>
              <span style={{ ...mono, letterSpacing: 1 }}>
                {r.bin.slice(0, 4)}
                <span style={{ opacity: 0.4 }}> </span>
                {r.bin.slice(4)}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ color: 'var(--text2)' }}>{r.read}</span>
            </div>
          ))}
        </div>
      )}

      {sub === 'test' && (
        <div class="content" style={{ padding: 12, overflow: 'auto' }}>
          <div
            style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 6px' }}
          >
            4bit ↔ hex 練習（キーパッド入力）
          </div>
          <TestFeatureList features={nibbleFeatures} />
          <div
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              margin: '16px 0 6px',
            }}
          >
            語データを使った 10問・4択テスト
          </div>
          <TestFeatureList features={choiceFeatures} />
        </div>
      )}

      {showRecords && (
        <RecordPanel
          title={titleOf(showRecords)}
          records={recOf[showRecords].records}
          onDelete={recOf[showRecords].deleteRecord}
          onClear={recOf[showRecords].clearRecords}
          onClose={() => setShowRecords(null)}
        />
      )}
    </div>
  )
}

export default FFTab
