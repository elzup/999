import { h } from 'preact'
import { useState } from 'preact/hooks'
import NumDetailPanel from './NumDetailPanel'
import { numOfBmKey, useNumberContext } from '../lib/numberContext'

export type ReviewItem = {
  label: string
  correct: boolean
  userAnswer?: string
  rightAnswer: string
  /** ブックマークキー(例: 'n:573')。bookmarks/onToggleBm と揃ったとき★を出す。 */
  bmKey?: string
  /** テスト中に «あとで見返す» 印を付けた問題 */
  marked?: boolean
  /** タップで詳細パネルを開く番号。無ければ bmKey の番号を使う */
  num?: string
}

type Props = {
  title: string
  score: number
  total: number
  time: number
  items: ReviewItem[]
  onClose: () => void
  /** ★トグルを出したいクイズは両方を渡す(番号系クイズの振り返り復習用)。 */
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
}

const numOf = (item: ReviewItem) => item.num ?? numOfBmKey(item.bmKey)

function ReviewPanel({
  title,
  score,
  total,
  time,
  items,
  onClose,
  bookmarks,
  onToggleBm,
}: Props) {
  const ctx = useNumberContext()
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [detailNum, setDetailNum] = useState<string | null>(null)

  const markedCount = items.filter((i) => i.marked).length
  const shown = onlyMarked ? items.filter((i) => i.marked) : items
  const wrongItems = shown.filter((i) => !i.correct)
  const correctItems = shown.filter((i) => i.correct)
  const wrongTotal = items.filter((i) => !i.correct).length
  const detail = detailNum
    ? ctx?.numbers.find((entry) => entry.num === detailNum)
    : undefined

  const renderStar = (item: ReviewItem) => {
    if (!onToggleBm || !item.bmKey) return null
    const on = bookmarks ? bookmarks.has(item.bmKey) : false
    const key = item.bmKey
    return (
      <span
        class={'bm-star review-bm ' + (on ? 'on' : '')}
        onClick={(event) => {
          event.stopPropagation()
          onToggleBm(key)
        }}
      >
        {on ? '★' : '☆'}
      </span>
    )
  }

  const rowProps = (item: ReviewItem, kind: 'wrong' | 'correct') => {
    const num = ctx ? numOf(item) : null
    return {
      class:
        'review-item ' +
        kind +
        (item.marked ? ' is-marked' : '') +
        (num ? ' is-openable' : ''),
      onClick: num ? () => setDetailNum(num) : undefined,
    }
  }

  const mark = (item: ReviewItem) =>
    item.marked ? <span class="review-mark">⚑</span> : null

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
          {wrongTotal > 0 ? (
            <span class="review-wrong-count">{wrongTotal}問ミス</span>
          ) : (
            <span class="review-perfect">全問正解</span>
          )}
          {markedCount > 0 ? (
            <button
              class={'review-mark-filter' + (onlyMarked ? ' on' : '')}
              aria-pressed={onlyMarked}
              onClick={() => setOnlyMarked((prev) => !prev)}
            >
              ⚑ 印のみ {markedCount}
            </button>
          ) : null}
        </div>
        <div class="review-list">
          {wrongItems.length > 0 ? (
            <>
              <div class="review-section-label">間違えた問題</div>
              {wrongItems.map((item, i) => (
                <div key={'w' + i} {...rowProps(item, 'wrong')}>
                  {mark(item)}
                  <span class="review-label">{item.label}</span>
                  <span class="review-user">{item.userAnswer}</span>
                  <span class="review-arrow">&rarr;</span>
                  <span class="review-right">{item.rightAnswer}</span>
                  {renderStar(item)}
                </div>
              ))}
            </>
          ) : null}
          <div class="review-section-label">正解 ({correctItems.length})</div>
          {correctItems.map((item, i) => (
            <div key={'c' + i} {...rowProps(item, 'correct')}>
              {mark(item)}
              <span class="review-label">{item.label}</span>
              <span class="review-right">{item.rightAnswer}</span>
              {renderStar(item)}
            </div>
          ))}
        </div>
      </div>

      {detail && ctx ? (
        <div
          class="review-detail"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailNum(null)
          }}
        >
          <div class="review-detail-body">
            <NumDetailPanel
              d={detail}
              bookmarks={ctx.bookmarks}
              onToggleBm={ctx.onToggleBm}
              onEdit={() => ctx.openEditor(detail.num)}
            />
            <div class="panel-foot">
              <button class="btn-wide" onClick={() => setDetailNum(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ReviewPanel
