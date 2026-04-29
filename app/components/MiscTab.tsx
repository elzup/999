import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry, CardEntry, RulesData } from '../data/schema'
import BookmarkTab from './BookmarkTab'
import StorageEstimatePanel from './StorageEstimatePanel'
import TagPanel from './TagPanel'
import RulesPanel from './RulesPanel'

type Props = {
  numbers: NumberEntry[]
  cards: CardEntry[]
  rules?: RulesData
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type SubTab = 'bm' | 'tags' | 'rules' | 'stats' | 'storage'

function MiscTab({ numbers, cards, rules, bookmarks, onToggleBm }: Props) {
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
          class={'sub-tab-btn' + (sub === 'tags' ? ' active' : '')}
          onClick={() => handleSub('tags')}
        >
          タグ
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'rules' ? ' active' : '')}
          onClick={() => handleSub('rules')}
        >
          ルール
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'stats' ? ' active' : '')}
          onClick={() => handleSub('stats')}
        >
          統計
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'storage' ? ' active' : '')}
          onClick={() => handleSub('storage')}
        >
          容量
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
      {sub === 'tags' && <TagPanel numbers={numbers} />}
      {sub === 'rules' &&
        (rules ? (
          <RulesPanel rules={rules} />
        ) : (
          <div class="content" style={{ padding: 16, color: 'var(--text2)' }}>
            ルールデータが見つかりません
          </div>
        ))}
      {sub === 'stats' && <iframe class="stats-frame" src="./stats.html" />}
      {sub === 'storage' && <StorageEstimatePanel />}
    </div>
  )
}

export default MiscTab
