import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry, CardEntry } from '../data/schema'
import BookmarkTab from './BookmarkTab'

type Props = {
  numbers: NumberEntry[]
  cards: CardEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type SubTab = 'bm' | 'stats'

function MiscTab({ numbers, cards, bookmarks, onToggleBm }: Props) {
  const [sub, setSub] = useState<SubTab>('bm')

  const handleSub = useCallback((s: SubTab) => {
    setSub(s)
  }, [])

  const bmCount = bookmarks.size

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
      <div class="sub-tab-switch">
        <button
          class={'sub-tab-btn' + (sub === 'bm' ? ' active' : '')}
          onClick={() => handleSub('bm')}
        >
          ★ {bmCount > 0 && <span class="bar-badge">{bmCount}</span>}
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'stats' ? ' active' : '')}
          onClick={() => handleSub('stats')}
        >
          統計
        </button>
      </div>
      {sub === 'bm' && (
        <BookmarkTab
          numbers={numbers}
          cards={cards}
          bookmarks={bookmarks}
          onToggleBm={onToggleBm}
        />
      )}
      {sub === 'stats' && <iframe class="stats-frame" src="./stats.html" />}
    </div>
  )
}

export default MiscTab
