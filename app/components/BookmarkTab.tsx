import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { NumberEntry, CardEntry } from '../data/schema'
import { SUIT_LABEL } from '../data/constants'
import NumDetailPanel from './NumDetailPanel'
import CardDetailPanel from './CardDetailPanel'

type Props = {
  numbers: NumberEntry[]
  cards: CardEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
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

function scoreColor(score: number | null): string | null {
  if (score === null || score === undefined) return null
  return score >= 35 ? '#4ade80' : score >= 25 ? '#fbbf24' : '#f87171'
}

type NumCellProps = {
  d: NumberEntry
  selected: boolean
  onSelect: () => void
}

function NumCell({ d, selected, onSelect }: NumCellProps) {
  const hasWord = d.w1 || d.w2
  const sc = d.w1Score != null ? d.w1Score : d.w2Score
  const color = scoreColor(sc)
  const borderStyle =
    color && !selected ? { borderColor: color + '66' } : {}

  return (
    <div
      class={
        'num-cell' +
        (selected ? ' selected' : '') +
        (!hasWord ? ' empty' : '')
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

function BookmarkTab({ numbers, cards, bookmarks, onToggleBm }: Props) {
  const bmNums = useMemo(() => {
    const keys = [...bookmarks]
      .filter((k) => k.startsWith('n:'))
      .map((k) => k.slice(2))
    return numbers.filter((d) => keys.includes(d.num))
  }, [numbers, bookmarks])

  const bmCards = useMemo(() => {
    const keys = [...bookmarks]
      .filter((k) => k.startsWith('c:'))
      .map((k) => k.slice(2))
    return cards.filter((c) => keys.includes(c.suit + c.rank))
  }, [cards, bookmarks])

  const [selected, setSelected] = useState<string | null>(null)

  const selectedNum = useMemo(() => {
    if (!selected || !selected.startsWith('n:')) return null
    return numbers.find((d) => d.num === selected.slice(2)) || null
  }, [numbers, selected])

  const selectedCard = useMemo(() => {
    if (!selected || !selected.startsWith('c:')) return null
    return cards.find((c) => c.suit + c.rank === selected.slice(2)) || null
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
        {selectedNum ? (
          <NumDetailPanel
            d={selectedNum}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : selectedCard ? (
          <CardDetailPanel
            c={selectedCard}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div class="sticky-empty">タップして詳細表示</div>
        )}
      </div>
      <div class="content" style={{ flex: 1 }}>
        {bmNums.length > 0 ? (
          <>
            <div
              style={{
                marginBottom: '12px',
                color: 'var(--text2)',
                fontSize: '12px',
              }}
            >
              数字 ({bmNums.length})
            </div>
            <div class="num-grid" style={{ marginBottom: '16px' }}>
              {bmNums.map((d) => (
                <NumCell
                  key={d.num}
                  d={d}
                  selected={selected === 'n:' + d.num}
                  onSelect={() =>
                    setSelected(
                      selected === 'n:' + d.num ? null : 'n:' + d.num
                    )
                  }
                />
              ))}
            </div>
          </>
        ) : null}
        {bmCards.length > 0 ? (
          <>
            <div
              style={{
                marginBottom: '12px',
                color: 'var(--text2)',
                fontSize: '12px',
              }}
            >
              カード ({bmCards.length})
            </div>
            <div class="card-grid">
              {bmCards.map((c) => {
                const key = c.suit + c.rank
                return (
                  <CardCell
                    key={key}
                    c={c}
                    selected={selected === 'c:' + key}
                    onSelect={() =>
                      setSelected(
                        selected === 'c:' + key ? null : 'c:' + key
                      )
                    }
                  />
                )
              })}
            </div>
          </>
        ) : null}
        {bmNums.length === 0 && bmCards.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text2)',
              padding: '40px 0',
            }}
          >
            ★をタップしてブックマーク追加
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default BookmarkTab
