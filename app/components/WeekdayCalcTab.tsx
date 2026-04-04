import { h } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  calculateWeekday,
  createWeekdayQuiz,
  MONTH_CODES,
  WEEKDAY_NAMES_JA,
  type WeekdayQuestion,
  type WeekdayResult,
} from '../lib/weekday'

type Answer = {
  questionId: string
  selected: number
  correct: boolean
  elapsedMs: number
}

type ViewMode = 'explain' | 'test'

function todayString() {
  const now = new Date()
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
}

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`
}

function WeekdayExplanation({ result }: { result: WeekdayResult }) {
  return (
    <div class="weekday-panel">
      <div class="weekday-result-head">
        <div>
          <div class="weekday-date">{result.input}</div>
          <div class="weekday-answer">
            {result.weekdayJa}曜日
            <span class="weekday-answer-en">{result.weekdayName}</span>
          </div>
        </div>
        <div class="weekday-badges">
          <span class="weekday-badge">{result.month}月</span>
          <span class="weekday-badge">{result.isLeapYear ? '閏年' : '平年'}</span>
          {result.leapAdjust !== 0 && <span class="weekday-badge warn">補正 -1</span>}
        </div>
      </div>

      <div class="weekday-formula">w = (D + m + y + floor(y/4) + C) mod 7</div>

      <div class="weekday-step-list">
        {result.steps.map((step) => (
          <div key={step.name} class="weekday-step-card">
            <div class="weekday-step-label">{step.label}</div>
            <div class="weekday-step-value">{step.value}</div>
            <div class="weekday-step-explain">{step.explain}</div>
          </div>
        ))}
      </div>

      <div class="weekday-reference-grid">
        <div class="weekday-ref-card">
          <div class="weekday-ref-title">曜日 index</div>
          <div class="weekday-ref-row">
            {WEEKDAY_NAMES_JA.map((name, index) => (
              <span key={name} class="weekday-ref-chip">{index}:{name}</span>
            ))}
          </div>
        </div>
        <div class="weekday-ref-card">
          <div class="weekday-ref-title">月コード</div>
          <div class="weekday-ref-row">
            {Object.entries(MONTH_CODES).map(([month, code]) => (
              <span key={month} class="weekday-ref-chip">{month}月:{code}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function WeekdayCalcTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('explain')
  const [dateInput, setDateInput] = useState(todayString())
  const [result, setResult] = useState<WeekdayResult | null>(() => calculateWeekday(todayString()))
  const [error, setError] = useState('')
  const [quiz, setQuiz] = useState<WeekdayQuestion[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [quizStartedAt, setQuizStartedAt] = useState<number | null>(null)
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<number | null>(null)
  const [openExplanations, setOpenExplanations] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (viewMode === 'test' && quiz.length > 0 && answers.length < quiz.length && quizStartedAt !== null) {
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - quizStartedAt)
      }, 50)
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [viewMode, quiz, answers.length, quizStartedAt])

  const currentIndex = answers.length
  const currentQuestion = quiz[currentIndex] ?? null
  const answerMap = useMemo(() => {
    const map = new Map<string, Answer>()
    for (const answer of answers) map.set(answer.questionId, answer)
    return map
  }, [answers])

  const lastScore = answers.filter((answer) => answer.correct).length
  const finished = quiz.length > 0 && answers.length >= quiz.length

  const handleExplain = useCallback(() => {
    const next = calculateWeekday(dateInput)
    if (!next) {
      setError('無効な日付です。1500/01/01 から 2500/12/31 の範囲で入力してください。')
      setResult(null)
      return
    }
    setError('')
    setResult(next)
  }, [dateInput])

  const handleRandomExplain = useCallback(() => {
    const next = createWeekdayQuiz(1)[0]
    setDateInput(next.date)
    setError('')
    setResult(next.result)
  }, [])

  const startQuiz = useCallback(() => {
    const nextQuiz = createWeekdayQuiz(10)
    const now = Date.now()
    setViewMode('test')
    setQuiz(nextQuiz)
    setAnswers([])
    setQuizStartedAt(now)
    setQuestionStartedAt(now)
    setElapsedMs(0)
    setOpenExplanations({})
  }, [])

  const handleAnswer = useCallback((selected: number) => {
    if (!currentQuestion || questionStartedAt === null || finished) return
    const elapsed = Date.now() - questionStartedAt
    const nextAnswer: Answer = {
      questionId: currentQuestion.id,
      selected,
      correct: selected === currentQuestion.result.weekdayIndex,
      elapsedMs: elapsed,
    }
    setAnswers((prev) => [...prev, nextAnswer])
    setQuestionStartedAt(Date.now())
  }, [currentQuestion, questionStartedAt, finished])

  const toggleExplanation = useCallback((questionId: string) => {
    setOpenExplanations((prev) => ({ ...prev, [questionId]: !prev[questionId] }))
  }, [])

  return (
    <div class="weekday-layout">
      <div class="year-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>曜日計算</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
            解説と10問テスト
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button
              class={'d2-mode-btn' + (viewMode === 'explain' ? ' active' : '')}
              onClick={() => setViewMode('explain')}
            >
              解説
            </button>
            <button
              class={'d2-mode-btn' + (viewMode === 'test' ? ' active' : '')}
              onClick={() => setViewMode('test')}
            >
              テスト
            </button>
          </div>
        </div>
      </div>

      <div class="content" style={{ flex: 1, paddingBottom: '8px' }}>
        {viewMode === 'explain' ? (
          <div class="weekday-explain-stack">
            <div class="weekday-toolbar">
              <input
                class="search-input weekday-date-input"
                value={dateInput}
                onInput={(e) => setDateInput((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExplain()
                }}
                placeholder="YYYY/MM/DD"
              />
              <button class="filter-btn" onClick={handleExplain}>計算</button>
              <button class="filter-btn" onClick={handleRandomExplain}>ランダム</button>
            </div>
            {error ? <div class="weekday-error">{error}</div> : null}
            {result ? <WeekdayExplanation result={result} /> : null}
          </div>
        ) : (
          <div class="weekday-test-stack">
            <div class="weekday-test-summary">
              <div>
                <div class="weekday-test-title">曜日テスト</div>
                <div class="weekday-test-sub">1500年から2500年のランダム10問</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {quiz.length > 0 ? (
                  <span class="weekday-timer">
                    {lastScore}/{answers.length} ・ {formatMs(elapsedMs)}
                  </span>
                ) : null}
                <button class="filter-btn" onClick={startQuiz}>開始</button>
              </div>
            </div>

            {quiz.length === 0 ? (
              <div class="sticky-empty">開始で10問生成します</div>
            ) : (
              <>
                {currentQuestion && !finished ? (
                  <div class="weekday-current-card">
                    <div class="weekday-current-no">Q{currentIndex + 1}</div>
                    <div class="weekday-current-date">{currentQuestion.date}</div>
                    <div class="weekday-current-help">日曜から縦1列で選択</div>
                  </div>
                ) : (
                  <div class="weekday-current-card done">
                    <div class="weekday-current-date">完了</div>
                    <div class="weekday-current-help">
                      {lastScore}/10 正解 ・ 合計 {formatMs(elapsedMs)}
                    </div>
                  </div>
                )}

                <div class="weekday-answer-row">
                  {WEEKDAY_NAMES_JA.map((name, index) => {
                    const disabled = !currentQuestion || finished
                    return (
                      <button
                        key={name}
                        class="weekday-answer-btn"
                        disabled={disabled}
                        onClick={() => handleAnswer(index)}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>

                <div class="weekday-quiz-list">
                  {quiz.map((question, index) => {
                    const answer = answerMap.get(question.id)
                    const isOpen = !!openExplanations[question.id]
                    return (
                      <div key={question.id} class="weekday-quiz-card">
                        <div class="weekday-quiz-row">
                          <span class="weekday-quiz-no">Q{index + 1}</span>
                          <span class="weekday-quiz-date">{question.date}</span>
                          {answer ? (
                            <>
                              <span class={'weekday-quiz-status ' + (answer.correct ? 'ok' : 'ng')}>
                                {answer.correct ? '正解' : '不正解'}
                              </span>
                              <span class="weekday-quiz-picked">
                                {WEEKDAY_NAMES_JA[answer.selected]} → {question.result.weekdayJa}
                              </span>
                              <span class="weekday-quiz-time">{formatMs(answer.elapsedMs)}</span>
                              <button class="rec-btn" onClick={() => toggleExplanation(question.id)}>
                                {isOpen ? '解説を閉じる' : '解説'}
                              </button>
                            </>
                          ) : (
                            <span class="weekday-quiz-pending">未回答</span>
                          )}
                        </div>
                        {answer && isOpen ? (
                          <WeekdayExplanation result={question.result} />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default WeekdayCalcTab
