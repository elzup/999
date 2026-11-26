import type { CardEntry } from '../data/schema'
import { cardValues, formatCardId, suitColor } from '../data/cards'
import { useState } from 'preact/hooks'
import { BookmarkButton } from './Screen'
import CardEditForm from './CardEditForm'

type Props = {
  c: CardEntry
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type CardValueItem = [
  label: string,
  val: string,
  score: number,
  img: string | undefined
]

function CardDetailPanel({ c, bookmarks, onToggleBm }: Props) {
  const bmKey = 'c:' + c.suit + c.rank
  const isBm = bookmarks.has(bmKey)
  const [editing, setEditing] = useState(false)

  const items: CardValueItem[] = cardValues(c)
  const maxScore = items.length > 0 ? Math.max(...items.map(([, , s]) => s)) : 0

  return (
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-id" style={{ color: suitColor(c.suit) }}>
          {formatCardId(c)}
        </span>
      </div>
      {editing ? <CardEditForm c={c} onDone={() => setEditing(false)} /> : null}
      <div class="card-detail-body" hidden={editing}>
        {items.map(([label, val, score, img]) => {
          const isBest = score === maxScore
          const scoreWidth = `${(Math.max(0, Math.min(3, score)) / 3) * 100}%`
          return (
            <div
              class="card-detail-item"
              key={label}
              style={{ opacity: isBest ? 1 : 0.55 }}
            >
              {img ? (
                <img class="cd-img" loading="lazy" src={img} alt={val} />
              ) : null}
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
        {editing ? null : (
          <button class="card-edit-open" onClick={() => setEditing(true)}>
            編集
          </button>
        )}
        <BookmarkButton on={isBm} onToggle={() => onToggleBm(bmKey)} />
      </div>
    </div>
  )
}

export default CardDetailPanel
