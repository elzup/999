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

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const RECORDS_KEY = 'assoc999'
const QUIZ_LEN = 10

type Pool = 'all' | 'bm'
type QuizRun = { questions: ChoiceQuestion[]; id: number }

function AssocTestTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [pool, setPool] = useState<Pool>('all')
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

  const poolLabel = pool === 'bm' ? '★のみ' : '全体'

  const startChoice = useCallback(() => {
    setSummary(null)
    const items = assocPool(entries)
    setRun((prev) => ({
      questions: buildAssocQuiz(items, QUIZ_LEN, makeRng(Date.now())),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [entries])

  const startRecall = useCallback(() => {
    setRecall((prev) => ({ entries, id: (prev?.id ?? 0) + 1 }))
  }, [entries])

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
        title={`連想 自己採点（${poolLabel}）`}
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

  return (
    <div class="content assoc-test-home">
      <div class="assoc-pool-switch">
        <button
          class={'sub-tab-btn' + (pool === 'all' ? ' active' : '')}
          onClick={() => setPool('all')}
        >
          全体
        </button>
        <button
          class={'sub-tab-btn' + (pool === 'bm' ? ' active' : '')}
          onClick={() => setPool('bm')}
        >
          ★のみ
        </button>
        <span class="assoc-pool-count">{count}件</span>
      </div>

      <p class="assoc-test-desc">
        数字を見て語を連想するテスト。「4択」は選んで採点、「自己採点」は答えを見て
        ○/×を自分で付けていく縦長リスト（×は自動でブックマーク）。
      </p>

      <div class="assoc-mode-list">
        <button
          class="assoc-mode-btn"
          disabled={!canStart}
          onClick={startRecall}
        >
          <span class="assoc-mode-title">連想 自己採点</span>
          <span class="assoc-mode-sub">縦長・答えを見て○×</span>
        </button>
        <button
          class="assoc-mode-btn"
          disabled={!canStart}
          onClick={startChoice}
        >
          <span class="assoc-mode-title">連想 4択</span>
          <span class="assoc-mode-sub">選んで採点・記録あり</span>
        </button>
      </div>

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
          {rec.records.length > 0 ? (
            <button
              class="filter-btn"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                marginLeft: '8px',
              }}
              onClick={() => setShowRecords(true)}
            >
              記録
            </button>
          ) : null}
        </div>
      ) : null}

      {!canStart ? (
        <div class="assoc-test-empty">
          {pool === 'bm'
            ? '★ブックマークした番号がありません'
            : '語が登録された番号がありません'}
        </div>
      ) : null}

      {showRecords ? (
        <RecordPanel
          title="連想 4択"
          records={rec.records}
          onDelete={rec.deleteRecord}
          onClear={rec.clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}
    </div>
  )
}

export default AssocTestTab
