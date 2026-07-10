import { useEffect, useReducer, useCallback, useRef } from 'preact/hooks'
import { vibrate } from '../lib/haptics'
import type { ReviewItem } from './ReviewPanel'

/** 4択クイズ1問。prompt(問題表示) / answer(正解) / choices(選択肢, answer含む) */
export type ChoiceQuestion = {
  prompt: string
  answer: string
  choices: string[]
}

export type QuizSummary = {
  score: number
  total: number
  time: number // 秒
  reviews: ReviewItem[]
}

type Props = {
  title: string
  questions: ChoiceQuestion[]
  onQuit: () => void
  onRetry: () => void
  /** 全問終了時に1回だけ呼ばれる(記録保存/振り返り生成に使う) */
  onComplete?: (summary: QuizSummary) => void
  /** 結果画面に「記録」ボタンを出す */
  onShowRecords?: () => void
  /** 結果画面に「振り返り」ボタンを出す */
  onShowReview?: () => void
  /** 問題表示の追加クラス(例: 等幅にしたい等) */
  promptClass?: string
}

// 自動送りのディレイ。正解はサクサク、誤答は正解を読めるよう少し長く。
const DELAY_CORRECT = 320
const DELAY_WRONG = 900

type State = {
  idx: number
  picked: string | null
  score: number
  reviews: ReviewItem[]
}
type Action =
  | { type: 'pick'; choice: string; correct: boolean; review: ReviewItem }
  | { type: 'next' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'pick':
      if (state.picked !== null) return state
      return {
        ...state,
        picked: action.choice,
        score: state.score + (action.correct ? 1 : 0),
        reviews: [...state.reviews, action.review],
      }
    case 'next':
      return { ...state, idx: state.idx + 1, picked: null }
    default:
      return state
  }
}

/**
 * 既存の choice テスト UI(.cm-* / .test-screen / .pi-header)を流用した共有クイズ画面。
 * 回答すると即フィードバック → 自動で次へ進む(サクサク)。
 * ループ/採点/振り返り集計はここが持ち、記録の永続化は onComplete 経由で呼び出し側に委ねる。
 */
function ChoiceQuiz({
  title,
  questions,
  onQuit,
  onRetry,
  onComplete,
  onShowRecords,
  onShowReview,
  promptClass,
}: Props) {
  const [state, dispatch] = useReducer(reducer, {
    idx: 0,
    picked: null,
    score: 0,
    reviews: [],
  })
  const { idx, picked, score, reviews } = state
  const finished = idx >= questions.length
  const q = questions[idx]

  const startRef = useRef(Date.now())
  const completedRef = useRef(false)

  const pick = useCallback(
    (choice: string) => {
      if (picked !== null) return
      vibrate()
      const correct = choice === q.answer
      dispatch({
        type: 'pick',
        choice,
        correct,
        review: {
          label: q.prompt,
          correct,
          userAnswer: choice,
          rightAnswer: q.answer,
        },
      })
    },
    [picked, q]
  )

  const advance = useCallback(() => dispatch({ type: 'next' }), [])

  // 回答後、一定時間で自動送り。誤答は長め。アンマウント/再回答で解除。
  useEffect(() => {
    if (picked === null || finished) return
    const correct = picked === q.answer
    const timer = setTimeout(advance, correct ? DELAY_CORRECT : DELAY_WRONG)
    return () => clearTimeout(timer)
  }, [picked, finished, q, advance])

  // 全問終了時に1回だけ集計を通知
  useEffect(() => {
    if (!finished || completedRef.current) return
    completedRef.current = true
    onComplete?.({
      score,
      total: questions.length,
      time: Math.round((Date.now() - startRef.current) / 1000),
      reviews,
    })
  }, [finished, score, reviews, questions.length, onComplete])

  if (finished) {
    return (
      <div class="test-screen quiz-screen">
        <div class="pi-header">
          <div class="pi-header-title">{title} 結果</div>
        </div>
        <div class="content" style={{ flex: 1 }}>
          <div class="cm-quiz-wrap quiz-result">
            <div class="quiz-result-score">
              {score} / {questions.length}
            </div>
            <div class="quiz-result-actions">
              <button class="filter-btn active" onClick={onRetry}>
                もう一度
              </button>
              {onShowReview ? (
                <button class="filter-btn" onClick={onShowReview}>
                  振り返り
                </button>
              ) : null}
              {onShowRecords ? (
                <button class="filter-btn" onClick={onShowRecords}>
                  記録
                </button>
              ) : null}
              <button class="filter-btn" onClick={onQuit}>
                終了
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const revealed = picked !== null

  return (
    <div class="test-screen quiz-screen">
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div class="pi-header-title">{title}</div>
          <span
            style={{
              fontSize: '13px',
              color: 'var(--accent)',
              fontFamily: 'monospace',
            }}
          >
            {score}正解
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
            {idx + 1}/{questions.length}
          </span>
          <button
            class="filter-btn"
            style={{
              fontSize: '12px',
              minWidth: '50px',
              padding: '4px 10px',
              marginLeft: 'auto',
            }}
            onClick={onQuit}
          >
            終了
          </button>
        </div>
      </div>

      {/* 回答後はどこをタップしても即次へ(待ち time をスキップ) */}
      <div
        class="content"
        style={{ flex: 1 }}
        onClick={revealed ? advance : undefined}
      >
        <div class="cm-quiz-wrap">
          <div class="cm-card-prompt">
            <div class="cm-card-order">
              {idx + 1} / {questions.length}
            </div>
            <div
              class={'cm-card-face' + (promptClass ? ' ' + promptClass : '')}
            >
              {q.prompt}
            </div>
          </div>

          <div class="cm-choice-list">
            {q.choices.map((choice, i) => {
              const isAnswer = choice === q.answer
              const isPicked = choice === picked
              const cls =
                'cm-choice-btn' +
                (revealed && isAnswer ? ' is-correct' : '') +
                (revealed && isPicked && !isAnswer ? ' is-wrong' : '')
              return (
                <button
                  key={choice}
                  class={cls}
                  disabled={revealed}
                  onClick={() => pick(choice)}
                >
                  <span class="cm-choice-index">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span class="cm-choice-value">{choice}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChoiceQuiz
