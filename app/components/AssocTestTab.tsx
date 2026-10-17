import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import RecallListQuiz from './RecallListQuiz'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import { useQuizRecords } from '../lib/useQuizRecords'
import { assocPool, buildAssocQuiz } from '../lib/assocQuiz'
import { candidatesOf } from '../lib/choice'
import { makeRng } from '../lib/kukuQuiz'
import SlideLauncher from './SlideLauncher'
import TestFeatureList from './TestFeatureList'
import Screen, { DockRow } from './Screen'
import { numberDeck } from './slideDecks'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const RECORDS_KEY = 'assoc999'
const QUIZ_LEN = 10
// 自己採点は 1 回で 1000 件近く並ぶと最後まで使わないので、百の位ごと (100 件) に区切る
const BLOCKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

type Pool = 'all' | 'bm'
type QuizRun = { questions: ChoiceQuestion[]; id: number }

function AssocTestTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [pool, setPool] = useState<Pool>('all')
  const [block, setBlock] = useState(0)
  const [run, setRun] = useState<QuizRun | null>(null)
  const [recall, setRecall] = useState<{
    entries: NumberEntry[]
    id: number
  } | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const rec = useQuizRecords(RECORDS_KEY)

  // 語を持つ entry のみ。★のみなら bookmark された番号に絞る。
  const entries = useMemo(() => {
    const withWord = numbers.filter((n) => candidatesOf(n).length > 0)
    if (pool === 'bm')
      return withWord.filter((n) => bookmarks.has('n:' + n.num))
    return withWord
  }, [numbers, pool, bookmarks])

  const slideDeck = useMemo(() => numberDeck(numbers), [numbers])

  const poolLabel = pool === 'bm' ? '★のみ' : '全体'

  const blockCounts = useMemo(
    () =>
      BLOCKS.map((b) => entries.filter((n) => n.num[0] === String(b)).length),
    [entries]
  )

  const startChoice = useCallback(() => {
    setSummary(null)
    const items = assocPool(entries)
    setRun((prev) => ({
      questions: buildAssocQuiz(items, QUIZ_LEN, makeRng(Date.now())),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [entries])

  const startRecall = useCallback(() => {
    const inBlock = entries.filter((n) => n.num[0] === String(block))
    setRecall((prev) => ({ entries: inBlock, id: (prev?.id ?? 0) + 1 }))
  }, [entries, block])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      rec.addRecord(s)
    },
    [rec]
  )

  if (recall) {
    return (
      <RecallListQuiz
        key={recall.id}
        title={`連想 自己採点（${block}xx・${poolLabel}）`}
        entries={recall.entries}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
        onQuit={() => setRecall(null)}
      />
    )
  }

  // 全問終了 → summary が入ったら結果オーバーレイを自動表示。閉じるとタブ表示に戻る
  // (年号/年コード/カード/π と同じ流れ)。
  if (run && summary) {
    return (
      <ReviewPanel
        title="連想 4択"
        score={summary.score}
        total={summary.total}
        time={summary.time}
        items={summary.reviews}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
        onClose={() => {
          setRun(null)
          setSummary(null)
        }}
      />
    )
  }

  if (run) {
    return (
      <ChoiceQuiz
        key={run.id}
        title={`連想 4択（${poolLabel}）`}
        questions={run.questions}
        promptClass="assoc-quiz-face"
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  const count = entries.length
  const canStart = count > 0
  const blockCount = blockCounts[block]

  // 説明・前回成績・空の案内は読むだけなので main。範囲の切り替えと開始は dock
  const main = (
    <div class="stack-up" style={{ '--stack-gap': '12px' }}>
      {!canStart ? (
        <div class="assoc-test-empty">
          {pool === 'bm'
            ? '★ブックマークした番号がありません'
            : '語が登録された番号がありません'}
        </div>
      ) : null}

      {rec.last ? (
        <div class="assoc-record-line">
          4択 前回 <b>{rec.last.score}</b>/{rec.last.total}
          {rec.best ? (
            <>
              {' '}
              最高 <b style={{ color: 'var(--warn)' }}>{rec.best.score}</b>/
              {rec.best.total}
            </>
          ) : null}
        </div>
      ) : null}

      <p class="assoc-test-desc">
        数字を見て語を連想するテスト。「4択」は選んで採点、「自己採点」は答えを見て
        ○/×を自分で付けていく縦長リスト（×は自動でブックマーク）。
      </p>
    </div>
  )

  const dock = (
    <>
      <DockRow>
        <button
          class={'filter-btn' + (pool === 'all' ? ' active' : '')}
          onClick={() => setPool('all')}
        >
          全体
        </button>
        <button
          class={'filter-btn' + (pool === 'bm' ? ' active' : '')}
          onClick={() => setPool('bm')}
        >
          ★のみ
        </button>
        <span class="dock-row-label">{count}件</span>
      </DockRow>

      <div class="assoc-block-grid">
        {BLOCKS.map((b) => (
          <button
            key={b}
            class={'assoc-block-btn' + (block === b ? ' active' : '')}
            disabled={blockCounts[b] === 0}
            onClick={() => setBlock(b)}
          >
            <span class="assoc-block-label">{b}xx</span>
            <span class="assoc-block-count">{blockCounts[b]}</span>
          </button>
        ))}
      </div>

      {/* TestFeatureList は disabled を持たないので、対象 0 件のときは開始を握りつぶす
          (旧ボタンの disabled と同じく何も起きない) */}
      <TestFeatureList
        features={[
          {
            id: 'assoc-recall',
            title: `連想 自己採点 ${block}xx（${blockCount}件）`,
            inputMethod: 'advance',
            onStart: () => {
              if (blockCount > 0) startRecall()
            },
          },
          {
            id: 'assoc-choice',
            title: '連想 4択',
            inputMethod: 'choice',
            hasRecords: rec.records.length > 0,
            onStart: () => {
              if (canStart) startChoice()
            },
            onShowRecords: () => setShowRecords(true),
          },
        ]}
      />

      <SlideLauncher
        deck={slideDeck}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
      />

      {showRecords ? (
        <RecordPanel
          title="連想 4択"
          records={rec.records}
          onDelete={rec.deleteRecord}
          onClear={rec.clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}
    </>
  )

  return <Screen main={main} dock={dock} />
}

export default AssocTestTab
