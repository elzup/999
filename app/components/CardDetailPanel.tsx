import type { CardEntry } from '../data/schema'
import { cardValues, formatCardId } from '../data/cards'
import { IconStar, IconStarOutline } from './Icons'

type Props = {
  c: CardEntry
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onClose?: () => void
}

type CardValueItem = [label: string, val: string, score: number]

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
      {/* 操作はカードの最下段 (NumDetailPanel と同じ並び・見た目) */}
      <div class="detail-foot-actions">
        <button
          class={'detail-act' + (isBm ? ' on' : '')}
          onClick={() => onToggleBm(bmKey)}
          aria-pressed={isBm}
        >
          {isBm ? <IconStar /> : <IconStarOutline />}
          <span>{isBm ? '登録済み' : 'ブックマーク'}</span>
        </button>
        {onClose && (
          <button class="detail-act" onClick={onClose}>
            閉じる
          </button>
        )}
      </div>
    </div>
  )
}

export default CardDetailPanel
