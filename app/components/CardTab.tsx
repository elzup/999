import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { CardEntry } from '../data/schema'
import { SUIT_LABEL } from '../data/constants'
import CardDetailPanel from './CardDetailPanel'

type Props = {
  cards: CardEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const SUIT_NAME: Record<string, string> = {
  S: 'スペード',
  H: 'ハート',
  C: 'クラブ',
  D: 'ダイヤ',
}

type CardCellProps = {
  c: CardEntry
  selected: boolean
  onSelect: () => void
}

function CardCell({ c, selected, onSelect }: CardCellProps) {
  const id = SUIT_LABEL[c.suit] + c.rank
  return (
    <div
      class={'card-cell' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      <div class={'card-id ' + c.suit}>{id}</div>
    </div>
  )
}

const SUITS = ['S', 'H', 'C', 'D'] as const

function CardTab({ cards, bookmarks, onToggleBm }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const selectedCard = useMemo(() => {
    if (selected === null) return null
    return cards.find((c) => c.suit + c.rank === selected) || null
  }, [cards, selected])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div class="sticky-wrap">
        {selectedCard ? (
          <CardDetailPanel
            c={selectedCard}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div class="sticky-empty">カードを選択</div>
        )}
      </div>
      <div class="content" style={{ flex: 1 }}>
        <div class="card-grid">
          {SUITS.map((s) => (
            <>
              <div class="card-suit-header" key={'h' + s}>
                {SUIT_LABEL[s]} {SUIT_NAME[s]}
              </div>
              {cards
                .filter((c) => c.suit === s)
                .map((c) => {
                  const key = s + c.rank
                  return (
                    <CardCell
                      key={key}
                      c={c}
                      selected={selected === key}
                      onSelect={() =>
                        setSelected(selected === key ? null : key)
                      }
                    />
                  )
                })}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CardTab
