import { useRef, useState } from 'preact/hooks'
import { vibrate } from '../lib/haptics'
import type { QuizSummary } from './ChoiceQuiz'
import type { ReviewItem } from './ReviewPanel'

// 一桁ずつキーで答えるクイズ。答えの桁数だけ入力すると自動採点。
//   pad='hex' → 0-F の16キー(4x4グリッド) / pad='bin' → 0,1 の2キー
// 答え長は question.answer の長さから決まる(hex1桁 / bin4桁 / bin8桁 など)。

export type KeypadQuestion = {
  prompt: string
  answer: string
  promptClass?: string
}

type GradeGuard = { current: boolean }

export function claimKeypadGrade(
  guard: GradeGuard,
  question: KeypadQuestion,
  answer: string
): ReviewItem | null {
  if (guard.current) return null
  guard.current = true
  return {
    label: question.prompt,
    correct: answer === question.answer,
    userAnswer: answer,
    rightAnswer: question.answer,
  }
}

export function buildKeypadSummary(
  score: number,
  total: number,
  startedAt: number,
  completedAt: number,
  reviews: ReviewItem[]
): QuizSummary {
  return {
    score,
    total,
    time: Math.round((completedAt - startedAt) / 1000),
    reviews,
  }
}

type Props = {
  title: string
  pad: 'hex' | 'bin'
  questions: KeypadQuestion[]
  onQuit: () => void
  onComplete: (s: QuizSummary) => void
}

const HEX = '0123456789ABCDEF'.split('')

function KeypadQuiz({ title, pad, questions, onQuit, onComplete }: Props) {
  const [idx, setIdx] = useState(0)
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false)
  const gradingRef = useRef(false)
  const scoreRef = useRef(0)
  const reviewsRef = useRef<ReviewItem[]>([])
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = questions[idx]
  const keys = pad === 'hex' ? HEX : ['0', '1']
  const correct = typed === q.answer

  const press = (k: string) => {
    if (gradingRef.current) return
    const next = typed + k
    if (next.length < q.answer.length) {
      setTyped(next)
      return
    }
    // 最終桁 → 採点
    const review = claimKeypadGrade(gradingRef, q, next)
    if (!review) return
    const ok = review.correct
    if (ok) scoreRef.current += 1
    reviewsRef.current.push(review)
    vibrate()
    setTyped(next)
    setRevealed(true)
    timerRef.current = setTimeout(
      () => {
        if (idx + 1 >= questions.length) {
          onComplete(
            buildKeypadSummary(
              scoreRef.current,
              questions.length,
              startRef.current,
              Date.now(),
              reviewsRef.current
            )
          )
        } else {
          setIdx(idx + 1)
          setTyped('')
          gradingRef.current = false
          setRevealed(false)
        }
      },
      ok ? 350 : 950
    )
  }

  const backspace = () => {
    if (!revealed) setTyped((t) => t.slice(0, -1))
  }

  // 入力スロット表示(答え桁数ぶん)。bin は4桁ごとに空ける。
  const slots = Array.from({ length: q.answer.length }, (_, i) => i)
  const slotColor = revealed
    ? correct
      ? 'var(--green, #34d399)'
      : 'var(--red, #f87171)'
    : 'var(--text)'

  return (
    <div
      class="test-screen quiz-screen"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
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
            {scoreRef.current}正解
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
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current)
              onQuit()
            }}
          >
            終了
          </button>
        </div>
      </div>

      <div
        class="content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div class="cm-quiz-wrap">
          <div class="cm-card-prompt">
            <div class="cm-card-order">
              {idx + 1} / {questions.length}
            </div>
            <div
              class={
                'cm-card-face' + (q.promptClass ? ' ' + q.promptClass : '')
              }
              style={{
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: 4,
              }}
            >
              {q.prompt}
            </div>
          </div>

          {/* 入力スロット */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              margin: '4px 0 16px',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {slots.map((i) => (
              <span
                key={i}
                style={{
                  minWidth: 22,
                  textAlign: 'center',
                  color: typed[i] ? slotColor : 'var(--muted, #6b7280)',
                  borderBottom: `2px solid ${
                    typed[i] ? slotColor : 'var(--line, rgba(255,255,255,.18))'
                  }`,
                  marginRight: pad === 'bin' && (i + 1) % 4 === 0 ? 10 : 0,
                }}
              >
                {typed[i] ?? '·'}
              </span>
            ))}
          </div>
          {revealed && !correct && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--green, #34d399)',
                fontFamily: 'ui-monospace, monospace',
                marginTop: -8,
                marginBottom: 12,
              }}
            >
              正解: {q.answer}
            </div>
          )}
        </div>
      </div>

      {/* キーパッド(画面下部に固定・親指で届く位置) */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '10px 12px 14px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              pad === 'hex' ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
            gap: 8,
            width: '100%',
            maxWidth: pad === 'hex' ? 420 : 320,
            margin: '0 auto',
          }}
        >
          {keys.map((k) => (
            <button
              key={k}
              disabled={revealed}
              onClick={() => press(k)}
              style={{
                padding: pad === 'hex' ? '18px 0' : '24px 0',
                fontSize: 24,
                fontWeight: 700,
                fontFamily: 'ui-monospace, monospace',
                borderRadius: 12,
                border: '1.5px solid var(--line, rgba(255,255,255,.12))',
                background: 'var(--surface2, #1e212a)',
                color: 'var(--text)',
                cursor: revealed ? 'default' : 'pointer',
              }}
            >
              {k}
            </button>
          ))}
          <button
            disabled={revealed || typed.length === 0}
            onClick={backspace}
            style={{
              gridColumn: pad === 'hex' ? 'span 4' : 'span 2',
              padding: '12px 0',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
              border: '1.5px solid var(--line, rgba(255,255,255,.12))',
              background: 'transparent',
              color: 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            ⌫ 消す
          </button>
        </div>
      </div>
    </div>
  )
}

export default KeypadQuiz
