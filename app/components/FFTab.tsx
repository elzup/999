import { useState, useCallback, useMemo } from 'preact/hooks'
import TestFeatureList, {
  TestFeatureSection,
  type TestFeatureAction,
} from './TestFeatureList'
import Screen, { DockRow } from './Screen'
import SubTabGroup from './SubTabGroup'
import SlideLauncher from './SlideLauncher'
import { ffDeck } from './slideDecks'
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
import {
  getFfRows,
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
  fontFamily: 'var(--font-mono)',
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
  const [run, setRun] = useState<FfRun | null>(null)
  // 語データは描画前に注入済み (App の applyData)。マウント中は変わらない
  const slideDeck = useMemo(ffDeck, [])
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

  const refMain = (
    <div class="stack-up" style={{ '--stack-gap': '0px' }}>
      {getFfRows().map((r) => (
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
          <span style={{ ...mono, fontWeight: 700, width: 28 }}>{r.hex}</span>
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
  )

  const binMain = (
    <div class="stack-up" style={{ '--stack-gap': '0px' }}>
      {getFfRows().map((r) => (
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
          <span style={{ ...mono, fontWeight: 700, width: 28 }}>{r.hex}</span>
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
  )

  // バイナリー記憶は設定が 3 段あり、テストの一覧に並べると dock が画面の上半分まで
  // 伸びる。0/1 の表を見る «binary» の dock に置く (記憶の素材と同じ場所)
  const binDock = (
    <>
      <TestFeatureSection label="バイナリー記憶（0/1を記憶→1行30桁で再現・行単位採点）">
        <>
          <DockRow>
            {BINARY_MEMO_OPTIONS.map((o) => (
              <button
                key={o.sec}
                class={'filter-btn' + (binMemoSec === o.sec ? ' active' : '')}
                onClick={() => setBinMemoSec(o.sec)}
              >
                {o.label}
              </button>
            ))}
          </DockRow>
          <DockRow>
            {BINARY_ROW_OPTIONS.map((n) => (
              <button
                key={n}
                class={'filter-btn' + (binRows === n ? ' active' : '')}
                onClick={() => setBinRows(n)}
              >
                {n}行
              </button>
            ))}
          </DockRow>
          <DockRow>
            <span class="dock-row-label">記憶ハイライト(8bit)</span>
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
          </DockRow>
          <TestFeatureList
            features={[
              {
                id: 'binary',
                title: `バイナリー記憶（${binRows * 30}桁）`,
                inputMethod: 'number',
                hasRecords: recBinary.records.length > 0,
                onStart: startBinary,
                onShowRecords: () => setShowBinRecords(true),
              },
            ]}
          />
        </>
      </TestFeatureSection>
      {showBinRecords && (
        <RecordPanel
          title="バイナリー記憶"
          records={recBinary.records}
          onDelete={recBinary.deleteRecord}
          onClear={recBinary.clearRecords}
          onClose={() => setShowBinRecords(false)}
        />
      )}
    </>
  )

  const testDock = (
    <>
      <TestFeatureSection label="4bit ↔ hex 練習（キーパッド入力）">
        <TestFeatureList features={nibbleFeatures} />
      </TestFeatureSection>
      <TestFeatureSection label="語データを使った 10問・4択テスト">
        <TestFeatureList features={choiceFeatures} />
      </TestFeatureSection>
      <TestFeatureSection label="hex を見て語を思い出す（送るだけ）">
        <SlideLauncher deck={slideDeck} />
      </TestFeatureSection>

      {showRecords && (
        <RecordPanel
          title={titleOf(showRecords)}
          records={recOf[showRecords].records}
          onDelete={recOf[showRecords].deleteRecord}
          onClear={recOf[showRecords].clearRecords}
          onClose={() => setShowRecords(null)}
        />
      )}
    </>
  )

  return (
    <SubTabGroup<Sub>
      storageKey={FF_SUB_KEY}
      tabs={[
        { id: 'ref', label: '確認', render: () => <Screen main={refMain} /> },
        {
          id: 'bin',
          label: 'binary',
          render: () => <Screen main={binMain} dock={binDock} />,
        },
        {
          id: 'test',
          label: 'テスト',
          render: () => <Screen main={null} dock={testDock} />,
        },
      ]}
    />
  )
}

export default FFTab
