import { useState, useCallback, useEffect } from 'preact/hooks'
import { validateAppData } from './data/parse'
import { loadBookmarks, saveBookmarks, loadTab, saveTab } from './data/storage'
import type { AppData } from './data/schema'
import type { TabId } from './data/constants'
import NumGroupTab from './components/NumGroupTab'
import CardTab from './components/CardTab'
import PiTab from './components/PiTab'
import YearTab from './components/YearTab'
import WeekdayTab from './components/WeekdayTab'
import MiscTab from './components/MiscTab'
import {
  IconNum,
  IconCard,
  IconPi,
  IconYear,
  IconWeekday,
  IconStats,
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

  return (
    <>
      {tab === 'num' && (
        <NumGroupTab numbers={data.numbers} bookmarks={bookmarks} onToggleBm={toggleBm} onCheckingChange={setLocked} />
      )}
      {tab === 'card' && (
        <CardTab cards={data.cards} bookmarks={bookmarks} onToggleBm={toggleBm} onCheckingChange={setLocked} />
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
      {tab === 'weekday' && (
        <WeekdayTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
          onCheckingChange={setLocked}
        />
      )}
      {tab === 'misc' && (
        <MiscTab
          numbers={data.numbers}
          cards={data.cards}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      <div class="bottom-bar" style={locked ? { pointerEvents: 'none', opacity: 0.4 } : {}}>
        <TabButton id="num" current={tab} onSelect={setTab} icon={<IconNum />} label="数字" />
        <TabButton id="card" current={tab} onSelect={setTab} icon={<IconCard />} label="カード" />
        <TabButton id="pi" current={tab} onSelect={setTab} icon={<IconPi />} label="π" />
        <TabButton id="year" current={tab} onSelect={setTab} icon={<IconYear />} label="年号" />
        <TabButton id="weekday" current={tab} onSelect={setTab} icon={<IconWeekday />} label="曜日" />
        <TabButton id="misc" current={tab} onSelect={setTab} icon={<IconStats />} label="その他" />
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
