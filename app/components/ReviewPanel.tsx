import { h } from 'preact'

export type ReviewItem = {
  label: string
  correct: boolean
  userAnswer?: string
  rightAnswer: string
}

type Props = {
  title: string
  score: number
  total: number
  time: number
  items: ReviewItem[]
  onClose: () => void
}

function ReviewPanel({ title, score, total, time, items, onClose }: Props) {
  const wrongItems = items.filter((i) => !i.correct)
  return (
    <div
      class="rec-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="review-panel">
        <div class="rec-panel-header">
          <h3>{title} 結果</h3>
          <button class="rec-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div class="review-summary">
          <span class="review-score">
            {score}/{total}
          </span>
          <span class="review-time">{time}秒</span>
          {wrongItems.length > 0 ? (
            <span class="review-wrong-count">
              {wrongItems.length}問ミス
            </span>
          ) : (
            <span class="review-perfect">全問正解</span>
          )}
        </div>
        <div class="review-list">
          {wrongItems.length > 0 ? (
            <>
              <div class="review-section-label">間違えた問題</div>
              {wrongItems.map((item, i) => (
                <div key={'w' + i} class="review-item wrong">
                  <span class="review-label">{item.label}</span>
                  <span class="review-user">{item.userAnswer}</span>
                  <span class="review-arrow">&rarr;</span>
                  <span class="review-right">{item.rightAnswer}</span>
                </div>
              ))}
            </>
          ) : null}
          <div class="review-section-label">
            正解 ({items.filter((i) => i.correct).length})
          </div>
          {items
            .filter((i) => i.correct)
            .map((item, i) => (
              <div key={'c' + i} class="review-item correct">
                <span class="review-label">{item.label}</span>
                <span class="review-right">{item.rightAnswer}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export default ReviewPanel
