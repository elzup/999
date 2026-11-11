// 一覧のマス (番号・カード)。全体 / 日付 / ブックマーク / カード で同じものを使う。
// 以前はブックマークに別のコピーがあり、«語があるか» の判定がずれていた
// (2〜3 番手だけ語がある番号が、ブックマークでだけ空に見えた)。
import { h } from 'preact'
import type { CardEntry, CardStats, NumberEntry } from '../data/schema'
import { formatCardId } from '../data/cards'
import { candidatesOf } from '../lib/choice'

function scoreColor(score: number | null): string | null {
  if (score === null || score === undefined) return null
  return score >= 3.5 ? '#4ade80' : score >= 2.5 ? '#fbbf24' : '#f87171'
}

type NumCellProps = {
  d: NumberEntry
  selected: boolean
  onSelect: () => void
}

export function NumCell({ d, selected, onSelect }: NumCellProps) {
  const hasWord = candidatesOf(d).length > 0
  const sc = d.w1Score != null ? d.w1Score : d.w2Score
  const color = scoreColor(sc)
  const borderStyle = color && !selected ? { borderColor: color + '66' } : {}

  return (
    <div
      class={
        'num-cell' + (selected ? ' selected' : '') + (!hasWord ? ' empty' : '')
      }
      style={borderStyle}
      onClick={onSelect}
    >
      <div class="num-id">{d.num}</div>
      {color ? (
        <div class="num-score-dot" style={{ background: color }} />
      ) : null}
    </div>
  )
}

type CardCellProps = {
  c: CardEntry
  selected: boolean
  onSelect: () => void
  /** テストの成績 (カードタブだけ出す) */
  stat?: CardStats[string]
}

export function CardCell({ c, selected, stat, onSelect }: CardCellProps) {
  const avgSec =
    stat && stat.attempts > 0
      ? (stat.totalTime / stat.attempts / 1000).toFixed(1)
      : null
  return (
    <div class={'card-cell' + (selected ? ' selected' : '')} onClick={onSelect}>
      <div class={'card-id ' + c.suit}>{formatCardId(c)}</div>
      {stat && stat.attempts > 0 ? (
        <div class="card-stat">
          {stat.wrong > 0 ? (
            <span class="card-stat-wrong">×{stat.wrong}</span>
          ) : null}
          {avgSec !== null ? (
            <span class="card-stat-time">{avgSec}s</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
