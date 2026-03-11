import { useState, useCallback, useEffect } from 'preact/hooks'
import { validateAppData } from './data/parse'
import { loadBookmarks, saveBookmarks, loadTab, saveTab } from './data/storage'
import type { AppData } from './data/schema'
import type { TabId } from './data/constants'
import NumberTab from './components/NumberTab'
import DigitTab from './components/DigitTab'
import CardTab from './components/CardTab'
import BookmarkTab from './components/BookmarkTab'
import PiTab from './components/PiTab'
import YearTab from './components/YearTab'
import {
  IconNum,
  IconD2,
  IconCard,
  IconStar,
  IconStats,
  IconPi,
  IconYear,
} from './components/Icons'

export function App() {
  const [tab, _setTab] = useState<TabId>(loadTab)
  const setTab = useCallback((t: TabId) => {
    saveTab(t)
    _setTab(t)
  }, [])
  const [data, setData] = useState<AppData | null>(null)
  const [bookmarks, setBookmarks] = useState(loadBookmarks)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    fetch('./data.json')
      .then((r) => r.json())
      .then((raw) => setData(validateAppData(raw)))
  }, [])

  const toggleBm = useCallback((key: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveBookmarks(next)
      return next
    })
  }, [])

  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>
        Loading...
      </div>
    )
  }

  const bmCount = bookmarks.size

  return (
    <>
      {tab === 'num' && (
        <NumberTab numbers={data.numbers} bookmarks={bookmarks} onToggleBm={toggleBm} />
      )}
      {tab === 'd2' && (
        <DigitTab numbers={data.numbers} bookmarks={bookmarks} onToggleBm={toggleBm} />
      )}
      {tab === 'card' && (
        <CardTab cards={data.cards} bookmarks={bookmarks} onToggleBm={toggleBm} />
      )}
      {tab === 'bm' && (
        <BookmarkTab
          numbers={data.numbers}
          cards={data.cards}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'pi' && (
        <PiTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
          onCheckingChange={setLocked}
        />
      )}
      {tab === 'year' && (
        <YearTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
          onCheckingChange={setLocked}
        />
      )}
      {tab === 'stats' && <iframe class="stats-frame" src="./stats.html" />}
      <div class="bottom-bar" style={locked ? { pointerEvents: 'none', opacity: 0.4 } : {}}>
        <TabButton id="num" current={tab} onSelect={setTab} icon={<IconNum />} label="数字" />
        <TabButton id="d2" current={tab} onSelect={setTab} icon={<IconD2 />} label="2桁" />
        <TabButton id="card" current={tab} onSelect={setTab} icon={<IconCard />} label="カード" />
        <TabButton id="bm" current={tab} onSelect={setTab} icon={<IconStar />}
          label={bmCount > 0 ? <>★ <span class="bar-badge">{bmCount}</span></> : '★'} />
        <TabButton id="pi" current={tab} onSelect={setTab} icon={<IconPi />} label="π" />
        <TabButton id="year" current={tab} onSelect={setTab} icon={<IconYear />} label="年号" />
        <TabButton id="stats" current={tab} onSelect={setTab} icon={<IconStats />} label="統計" />
      </div>
    </>
  )
}

function TabButton({
  id,
  current,
  onSelect,
  icon,
  label,
}: {
  id: TabId
  current: TabId
  onSelect: (t: TabId) => void
  icon: preact.JSX.Element
  label: preact.ComponentChildren
}) {
  return (
    <button class={'bar-tab' + (current === id ? ' active' : '')} onClick={() => onSelect(id)}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
