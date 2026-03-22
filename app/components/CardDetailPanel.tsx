import type { CardEntry } from '../data/schema'
import { SUIT_LABEL } from '../data/constants'

type Props = {
  c: CardEntry
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onClose?: () => void
}

type AiuItem = [label: string, val: string]

function suitColor(suit: string): string {
  if (suit === 'H') return '#f87171'
  if (suit === 'C') return '#4ade80'
  if (suit === 'D') return '#60a5fa'
  return '#94a3b8'
}

function CardDetailPanel({ c, bookmarks, onToggleBm, onClose }: Props) {
  const bmKey = 'c:' + c.suit + c.rank
  const isBm = bookmarks.has(bmKey)

  const aiuItems: AiuItem[] = [
    ['A', c.a],
    ['I', c.i],
    ['U', c.u],
  ]

  return (
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-id" style={{ color: suitColor(c.suit) }}>
          {SUIT_LABEL[c.suit]}
          {c.rank}
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
        {aiuItems.map(([label, val]) =>
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
