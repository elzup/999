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
import KukuTab from './components/KukuTab'
import EditorTab from './components/EditorTab'
import { consumeEditorTokenFromUrl } from './lib/editorAuth'
import { fetchEditorWords } from './lib/editorApi'
import {
  IconNum,
  IconCard,
  IconPi,
  IconYear,
  IconWeekday,
  IconKuku,
  IconStats,
  IconEdit,
} from './components/Icons'

export function App() {
  const [tab, _setTab] = useState<TabId>(loadTab)
  const [editorToken] = useState(consumeEditorTokenFromUrl)
  const setTab = useCallback((t: TabId) => {
    saveTab(t)
    _setTab(t)
  }, [])
  const [data, setData] = useState<AppData | null>(null)
  const [bookmarks, setBookmarks] = useState(loadBookmarks)

  useEffect(() => {
    fetch('./data.json')
      .then((r) => r.json())
      .then(async (raw) => {
        const initialData = validateAppData(raw)
        setData(initialData)

        if (!editorToken) return
        try {
          const liveWords = await fetchEditorWords(editorToken)
          setData({
            ...initialData,
            numbers: mergeNumberEntries(initialData.numbers, liveWords),
          })
        } catch {
          // Static data remains usable when the editor API is not deployed yet.
        }
      })
  }, [editorToken])

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
      <div
        style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}
      >
        Loading...
      </div>
    )
  }

  return (
    <>
      {tab === 'num' && (
        <NumGroupTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'card' && (
        <CardTab
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
        />
      )}
      {tab === 'year' && (
        <YearTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'weekday' && (
        <WeekdayTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'kuku' && <KukuTab />}
      {tab === 'misc' && (
        <MiscTab
          numbers={data.numbers}
          cards={data.cards}
          rules={data.rules}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'edit' && (
        <EditorTab
          numbers={data.numbers}
          token={editorToken}
          onSaved={(entry) =>
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    numbers: prev.numbers.map((current) =>
                      current.num === entry.num
                        ? { ...current, ...entry }
                        : current
                    ),
                  }
                : prev
            )
          }
        />
      )}
      <div class="bottom-bar">
        <TabButton
          id="num"
          current={tab}
          onSelect={setTab}
          icon={<IconNum />}
          label="数字"
        />
        <TabButton
          id="card"
          current={tab}
          onSelect={setTab}
          icon={<IconCard />}
          label="カード"
        />
        <TabButton
          id="pi"
          current={tab}
          onSelect={setTab}
          icon={<IconPi />}
          label="π"
        />
        <TabButton
          id="year"
          current={tab}
          onSelect={setTab}
          icon={<IconYear />}
          label="年号"
        />
        <TabButton
          id="weekday"
          current={tab}
          onSelect={setTab}
          icon={<IconWeekday />}
          label="曜日"
        />
        <TabButton
          id="kuku"
          current={tab}
          onSelect={setTab}
          icon={<IconKuku />}
          label="九九"
        />
        <TabButton
          id="misc"
          current={tab}
          onSelect={setTab}
          icon={<IconStats />}
          label="その他"
        />
        {editorToken && (
          <TabButton
            id="edit"
            current={tab}
            onSelect={setTab}
            icon={<IconEdit />}
            label="編集"
          />
        )}
      </div>
    </>
  )
}

function mergeNumberEntries(
  current: AppData['numbers'],
  live: AppData['numbers']
): AppData['numbers'] {
  const liveByNum = new Map(live.map((entry) => [entry.num, entry]))
  return current.map((entry) => ({
    ...entry,
    ...(liveByNum.get(entry.num) || {}),
  }))
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
    <button
      class={'bar-tab' + (current === id ? ' active' : '')}
      onClick={() => onSelect(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
