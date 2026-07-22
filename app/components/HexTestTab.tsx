import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import { useQuizRecords } from '../lib/useQuizRecords'
import { makeRng } from '../lib/kukuQuiz'
import {
  hexPool,
  buildHexQuiz,
  parseCode,
  type Notation,
  type Direction,
} from '../lib/hexQuiz'
import {
  confusionsOf,
  accumulate,
  summarize,
  type HexStats,
} from '../lib/hexStats'
import { loadHexStats, saveHexStats } from '../data/storage'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const RECORDS_KEY = 'hex999'
const QUIZ_LEN = 10

type QuizRun = { questions: ChoiceQuestion[]; id: number }

const NOTATION_LABEL: Record<Notation, string> = { hex: 'HEX', bin: '2進' }
const DIRECTION_LABEL: Record<Direction, string> = {
  toCode: '語→コード',
  toWord: 'コード→語',
}

function StatsPanel({
  stats,
  onClose,
  onClear,
}: {
  stats: HexStats
  onClose: () => void
  onClear: () => void
}) {
  const { total, byChar, pairs } = summarize(stats)
  const maxChar = byChar[0]?.count ?? 0

  return (
    <div
      class="rec-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="review-panel">
        <div class="rec-panel-header">
          <h3>間違えがちな文字</h3>
          <button class="rec-btn" onClick={onClose}>
            閉じる
          </button>
        </div>

        {total === 0 ? (
          <div class="assoc-test-empty">
            まだ記録がありません。「語→コード」で間違えると集計されます。
          </div>
        ) : (
          <div class="review-list">
            <div class="review-section-label">
              取り違えた文字 (正解だったのに間違えられた回数)
            </div>
            {byChar.map((c) => (
              <div
                key={c.char}
                class="hex-stat-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '3px 0',
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    width: '20px',
                  }}
                >
                  {c.char}
                </span>
                <span
                  style={{
                    height: '10px',
                    borderRadius: '5px',
                    background: 'var(--accent)',
                    width: `${maxChar ? (c.count / maxChar) * 100 : 0}%`,
                    minWidth: '4px',
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  {c.count}
                </span>
              </div>
            ))}

            <div class="review-section-label">取り違えペア (正解 → 誤答)</div>
            {pairs.slice(0, 12).map((p) => (
              <div
                key={p.from + p.to}
                class="review-item wrong"
                style={{ fontFamily: 'monospace' }}
              >
                <span class="review-right">{p.from}</span>
                <span class="review-arrow">&rarr;</span>
                <span class="review-user">{p.to}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '12px',
                    color: 'var(--text2)',
                  }}
                >
                  {p.count}回
                </span>
              </div>
            ))}

            <button
              class="filter-btn"
              style={{ marginTop: '12px', alignSelf: 'flex-start' }}
              onClick={onClear}
            >
              統計をリセット
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function HexTestTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [notation, setNotation] = useState<Notation>('hex')
  const [direction, setDirection] = useState<Direction>('toCode')
  const [run, setRun] = useState<QuizRun | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [hexStats, setHexStats] = useState<HexStats>(() => loadHexStats())
  const rec = useQuizRecords(RECORDS_KEY)

  const pool = useMemo(() => hexPool(numbers), [numbers])
  const canStart = pool.length >= 2

  const runLabel = `${NOTATION_LABEL[notation]}・${DIRECTION_LABEL[direction]}`

  const startChoice = useCallback(() => {
    setSummary(null)
    setRun((prev) => ({
      questions: buildHexQuiz(pool, QUIZ_LEN, makeRng(Date.now()), {
        notation,
        direction,
      }),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [pool, notation, direction])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      rec.addRecord(s)
      // 語→コードのときだけ、誤答をニブル単位で突き合わせて集計する。
      if (direction === 'toCode') {
        let next = loadHexStats()
        for (const r of s.reviews) {
          if (r.correct) continue
          const right = parseCode(r.rightAnswer, notation)
          const picked =
            r.userAnswer != null ? parseCode(r.userAnswer, notation) : null
          if (right == null || picked == null) continue
          next = accumulate(next, confusionsOf(right, picked))
        }
        saveHexStats(next)
        setHexStats(next)
      }
    },
    [rec, direction, notation]
  )

  const clearStats = useCallback(() => {
    const empty: HexStats = {}
    saveHexStats(empty)
    setHexStats(empty)
  }, [])

  // 全問終了 → summary が入ったら結果オーバーレイを自動表示 (他テストと統一)。
  if (run && summary) {
    return (
      <ReviewPanel
        title={`16進 4択（${runLabel}）`}
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
        title={`16進 4択（${runLabel}）`}
        questions={run.questions}
        promptClass={direction === 'toWord' ? 'hex-quiz-face' : undefined}
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  return (
    <div class="content assoc-test-home">
      <div class="assoc-pool-switch">
        <button
          class={'sub-tab-btn' + (notation === 'hex' ? ' active' : '')}
          onClick={() => setNotation('hex')}
        >
          HEX
        </button>
        <button
          class={'sub-tab-btn' + (notation === 'bin' ? ' active' : '')}
          onClick={() => setNotation('bin')}
        >
          2進
        </button>
        <span class="assoc-pool-count">{pool.length}件</span>
      </div>

      <div class="assoc-pool-switch">
        <button
          class={'sub-tab-btn' + (direction === 'toCode' ? ' active' : '')}
          onClick={() => setDirection('toCode')}
        >
          語 → コード
        </button>
        <button
          class={'sub-tab-btn' + (direction === 'toWord' ? ' active' : '')}
          onClick={() => setDirection('toWord')}
        >
          コード → 語
        </button>
      </div>

      <p class="assoc-test-desc">
        1バイト(0〜255)を、その10進の語で覚えるテスト。「語 → コード」は誤答が
        2×2（例: 正解 AB なら AB / CB / A9 / C9）で、1桁だけでは絞り込めない。
        表記を「2進」にすると bin ↔ 語のテストになる。
      </p>

      <div class="assoc-mode-list">
        <button
          class="assoc-mode-btn"
          disabled={!canStart}
          onClick={startChoice}
        >
          <span class="assoc-mode-title">16進 4択</span>
          <span class="assoc-mode-sub">{runLabel}・選んで採点・記録あり</span>
        </button>
        <button class="assoc-mode-btn" onClick={() => setShowStats(true)}>
          <span class="assoc-mode-title">間違えがちな文字</span>
          <span class="assoc-mode-sub">語→コードの誤答を桁ごとに集計</span>
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
          0〜255 に語が登録された番号が足りません
        </div>
      ) : null}

      {showRecords ? (
        <RecordPanel
          title="16進 4択"
          records={rec.records}
          onDelete={rec.deleteRecord}
          onClear={rec.clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}

      {showStats ? (
        <StatsPanel
          stats={hexStats}
          onClose={() => setShowStats(false)}
          onClear={clearStats}
        />
      ) : null}
    </div>
  )
}

export default HexTestTab
