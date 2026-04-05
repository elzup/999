import type { CardEntry } from '../data/schema'
import { cardValues, formatCardId } from '../data/cards'

type Props = {
  c: CardEntry
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onClose?: () => void
}

type CardValueItem = [label: string, val: string]

function suitColor(suit: string): string {
  if (suit === 'H') return '#f87171'
  if (suit === 'C') return '#4ade80'
  if (suit === 'D') return '#60a5fa'
  return '#94a3b8'
}

function CardDetailPanel({ c, bookmarks, onToggleBm, onClose }: Props) {
  const bmKey = 'c:' + c.suit + c.rank
  const isBm = bookmarks.has(bmKey)

  const items: CardValueItem[] = cardValues(c)
  const score = c.score ?? 0
  const scoreWidth = `${(Math.max(0, Math.min(3, score)) / 3) * 100}%`

  return (
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-id" style={{ color: suitColor(c.suit) }}>
          {formatCardId(c)}
        </span>
        <div class="detail-actions">
          <span
            class={'bm-star ' + (isBm ? 'on' : '')}
            style={{ fontSize: '22px' }}
            onClick={() => onToggleBm(bmKey)}
          >
            {isBm ? '★' : '☆'}
          </span>
          {onClose && (
            <button
              class="d2-mode-btn"
              style={{ padding: '4px 10px', flex: 'none' }}
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div class="card-detail-body">
        {c.score !== null ? (
          <div class="card-detail-item" key="score">
            <div class="cd-label">Score</div>
            <div class="cd-val">
              {c.score}/3
            </div>
            <div class="cd-scorebar">
              <div class="cd-scorefill" style={{ width: scoreWidth }} />
            </div>
          </div>
        ) : null}
        {items.map(([label, val]) =>
          val ? (
            <div class="card-detail-item" key={label}>
              <div class="cd-label">{label}</div>
              <div class="cd-val">{val}</div>
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}

export default CardDetailPanel
