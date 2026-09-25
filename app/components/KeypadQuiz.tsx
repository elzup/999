import { useRef, useState } from 'preact/hooks'
import { vibrate } from '../lib/haptics'
import Numpad from './Numpad'
import TestPad from './TestPad'
import MarkButton from './MarkButton'
import { applyMarks, useReviewMarks } from '../lib/reviewMarks'
import type { QuizSummary } from './ChoiceQuiz'
import type { ReviewItem } from './ReviewPanel'

// 一桁ずつキーで答えるクイズ。答えの桁数だけ入力すると自動採点。
//   pad='hex' → 0-F の16キー(4x4グリッド) / pad='bin' → 0,1 の2キー
//   pad='dec' → 共通テンキー(Numpad)を流用した 0-9
// 答え長は question.answer の長さから決まる(hex1桁 / bin4桁 / bin8桁 など)。

export type KeypadQuestion = {
  prompt: string
  answer: string
  promptClass?: string
  /** 採点後に問題の下へ出す補足 (例: その読みの割当数) */
  note?: string
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

export type KeypadPad = 'hex' | 'bin' | 'dec'

type Props = {
  title: string
  pad: KeypadPad
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
  const { marks, toggle: toggleMark } = useReviewMarks()
  // 採点タイマーの中から最新の印を読む (setTimeout は押した時点の marks を閉じ込める)
  const marksRef = useRef(marks)
  marksRef.current = marks

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
              applyMarks(reviewsRef.current, marksRef.current)
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
          <span style={{ marginLeft: 'auto' }}>
            <MarkButton
              on={marks.has(q.prompt)}
              onToggle={() => toggleMark(q.prompt)}
            />
          </span>
          <button
            class="filter-btn"
            style={{
              fontSize: '12px',
              minWidth: '50px',
              padding: '4px 10px',
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

          {/* 入力フォーム: 答えの桁数ぶんのマス。今どこを打っているかを出す */}
          <div
            class={
              'kq-slots' + (revealed ? (correct ? ' is-ok' : ' is-ng') : '')
            }
          >
            {slots.map((i) => (
              <span
                key={i}
                class={
                  'kq-slot' +
                  (typed[i] ? ' is-filled' : '') +
                  (!revealed && i === typed.length ? ' is-active' : '') +
                  (pad === 'bin' && (i + 1) % 4 === 0 ? ' is-nibble-end' : '')
                }
              >
                {typed[i] ?? ''}
              </span>
            ))}
          </div>
          <div class="kq-hint">
            {revealed
              ? correct
                ? '正解'
                : '不正解'
              : q.answer.length +
                '桁 (' +
                typed.length +
                '/' +
                q.answer.length +
                ')'}
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
          {revealed && q.note && (
            <div
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text2)',
                marginBottom: 12,
              }}
            >
              {q.note}
            </div>
          )}
        </div>
      </div>

      {/* 入力パッド(画面下部に固定・親指で届く位置)。形は全テスト共通 */}
      {pad === 'dec' ? (
        <Numpad
          onTapDigit={(d) => press(String(d))}
          onBackspace={backspace}
          backspaceDisabled={revealed || typed.length === 0}
        />
      ) : (
        <TestPad
          cols={pad === 'hex' ? 4 : 2}
          keys={keys.map((k) => ({ value: k, disabled: revealed }))}
          onPress={press}
          onBackspace={backspace}
          backspaceDisabled={revealed || typed.length === 0}
        />
      )}
    </div>
  )
}

export default KeypadQuiz
