import type { CardEntry } from '../data/schema'
import { cardValues, formatCardId, suitColor } from '../data/cards'
import { BookmarkButton } from './Screen'

type Props = {
  c: CardEntry
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type CardValueItem = [label: string, val: string, score: number]

function CardDetailPanel({ c, bookmarks, onToggleBm }: Props) {
  const bmKey = 'c:' + c.suit + c.rank
  const isBm = bookmarks.has(bmKey)

  const items: CardValueItem[] = cardValues(c)
  const maxScore = items.length > 0 ? Math.max(...items.map(([, , s]) => s)) : 0

  return (
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-id" style={{ color: suitColor(c.suit) }}>
          {formatCardId(c)}
        </span>
      </div>
      <div class="card-detail-body">
        {items.map(([label, val, score]) => {
          const isBest = score === maxScore
          const scoreWidth = `${(Math.max(0, Math.min(3, score)) / 3) * 100}%`
          return (
            <div
              class="card-detail-item"
              key={label}
              style={{ opacity: isBest ? 1 : 0.55 }}
            >
              <div class="cd-label">{label}</div>
              <div
                class="cd-val"
                style={{ fontWeight: isBest ? 'bold' : 'normal' }}
              >
                {val}
              </div>
              <div class="cd-scorebar">
                <div class="cd-scorefill" style={{ width: scoreWidth }} />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text2)' }}>
                {score}/3
              </div>
            </div>
          )
        })}
      </div>
      {/* カードの操作は ★ だけ (NumDetailPanel と同じ)。閉じる・前後は DetailSheet */}
      <div class="detail-foot-actions">
        <BookmarkButton on={isBm} onToggle={() => onToggleBm(bmKey)} />
      </div>
    </div>
  )
}

export default CardDetailPanel
