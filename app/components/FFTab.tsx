import { useState, useCallback } from 'preact/hooks'
import TestFeatureList, { type TestFeatureAction } from './TestFeatureList'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import ReviewPanel from './ReviewPanel'
import RecordPanel from './RecordPanel'
import KeypadQuiz, { type KeypadQuestion } from './KeypadQuiz'
import BinaryTest from './BinaryTest'
import {
  BINARY_MEMO_OPTIONS,
  BINARY_ROW_OPTIONS,
  genBinaryRows,
} from '../lib/binaryTest'
import { useQuizRecords } from '../lib/useQuizRecords'
import { loadSubTab, saveSubTab } from '../data/storage'
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

const FF_SUB_TABS = ['ref', 'bin', 'test'] as const
type Sub = typeof FF_SUB_TABS[number]
const FF_SUB_KEY = 'subtab.ff'
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
  const [sub, setSub] = useState<Sub>(() =>
    loadSubTab(FF_SUB_KEY, FF_SUB_TABS, 'ref')
  )
  const handleSub = useCallback((next: Sub) => {
    saveSubTab(FF_SUB_KEY, next)
    setSub(next)
  }, [])
  const [run, setRun] = useState<FfRun | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState<TestId | null>(null)

  // バイナリー記憶(記憶競技)。FfRun とは独立した状態で扱う。
  const [binRun, setBinRun] = useState<{
    rows: string[]
    memoSec: number
    recallSec: number
    highlight: boolean
    id: number
  } | null>(null)
  // 既定は公式ナショナルスタンダード(記憶5分 / 25行)。
  const [binMemoSec, setBinMemoSec] = useState<number>(
    BINARY_MEMO_OPTIONS[3].sec
  )
  const [binRows, setBinRows] = useState<number>(BINARY_ROW_OPTIONS[2])
  const [binHighlight, setBinHighlight] = useState(true)
  const [showBinRecords, setShowBinRecords] = useState(false)
  const recBinary = useQuizRecords('ff_binary')

  const startBinary = useCallback(() => {
    setBinRun((prev) => ({
      rows: genBinaryRows(binRows),
      memoSec: binMemoSec,
      recallSec: binMemoSec * 3, // 公式比: 記憶5分→回答15分
      highlight: binHighlight,
      id: (prev?.id ?? 0) + 1,
    }))
  }, [binRows, binMemoSec, binHighlight])

  const onBinComplete = useCallback(
    (s: QuizSummary) => {
      recBinary.addRecord(s)
    },
    [recBinary]
  )

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

  // 全テストのうち最後に実施したもの(記録の最新日時が最大)を「前回」として印す。
  const allIds: TestId[] = [...NIBBLE_KINDS, ...FF_DIRS]
  const lastDoneId = allIds.reduce<TestId | null>((best, id) => {
    const rec = recOf[id].last
    if (!rec) return best
    const bestRec = best ? recOf[best].last : null
    return !bestRec || rec.date > bestRec.date ? id : best
  }, null)

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

  if (binRun) {
    return (
      <BinaryTest
        key={binRun.id}
        title="バイナリー記憶"
        memoSec={binRun.memoSec}
        recallSec={binRun.recallSec}
        rows={binRun.rows}
        highlight={binRun.highlight}
        onQuit={() => setBinRun(null)}
        onComplete={onBinComplete}
      />
    )
  }

  // nibble(キーパッド) と語4択を同じ TestFeature 抽象に統一。記録も共通。
  const nibbleFeatures: TestFeatureAction[] = NIBBLE_KINDS.map((kind) => ({
    id: kind,
    title: NIBBLE[kind].title,
    inputMethod: 'number',
    hasRecords: recOf[kind].records.length > 0,
    lastDone: kind === lastDoneId,
    onStart: () => startNibble(kind),
    onShowRecords: () => setShowRecords(kind),
  }))
  const choiceFeatures: TestFeatureAction[] = FF_DIRS.map((dir) => ({
    id: dir,
    title: ffDirTitle(dir),
    inputMethod: 'choice',
    hasRecords: recOf[dir].records.length > 0,
    lastDone: dir === lastDoneId,
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
          onClick={() => handleSub('ref')}
        >
          確認
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'bin' ? ' active' : '')}
          onClick={() => handleSub('bin')}
        >
          binary
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'test' ? ' active' : '')}
          onClick={() => handleSub('test')}
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

          <div
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              margin: '16px 0 6px',
            }}
          >
            バイナリー記憶（0/1を記憶→1行30桁で再現・行単位採点）
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BINARY_MEMO_OPTIONS.map((o) => (
              <button
                key={o.sec}
                class={'filter-btn' + (binMemoSec === o.sec ? ' active' : '')}
                onClick={() => setBinMemoSec(o.sec)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
          >
            {BINARY_ROW_OPTIONS.map((n) => (
              <button
                key={n}
                class={'filter-btn' + (binRows === n ? ' active' : '')}
                onClick={() => setBinRows(n)}
              >
                {n}行
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              記憶ハイライト(8bit)
            </span>
            <button
              class={'filter-btn' + (binHighlight ? ' active' : '')}
              onClick={() => setBinHighlight(true)}
            >
              あり
            </button>
            <button
              class={'filter-btn' + (!binHighlight ? ' active' : '')}
              onClick={() => setBinHighlight(false)}
            >
              なし
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              class="filter-btn"
              style={{ fontWeight: 700, padding: '10px 20px' }}
              onClick={startBinary}
            >
              ▶ 開始（{binRows * 30}桁）
            </button>
            <button
              class="filter-btn"
              style={{
                padding: '10px 16px',
                opacity: recBinary.records.length > 0 ? undefined : 0.5,
              }}
              onClick={() => setShowBinRecords(true)}
            >
              記録（{recBinary.records.length}）
            </button>
          </div>
        </div>
      )}

      {showBinRecords && (
        <RecordPanel
          title="バイナリー記憶"
          records={recBinary.records}
          onDelete={recBinary.deleteRecord}
          onClear={recBinary.clearRecords}
          onClose={() => setShowBinRecords(false)}
        />
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
