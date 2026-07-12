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
import LockedScreen from './components/LockedScreen'
import { consumeEditorTokenFromUrl } from './lib/editorAuth'
import { fetchEditorWords } from './lib/editorApi'
import { fetchAppData } from './lib/appDataApi'
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
  const [token] = useState(consumeEditorTokenFromUrl)
  const setTab = useCallback((t: TabId) => {
    saveTab(t)
    _setTab(t)
  }, [])
  const [data, setData] = useState<AppData | null>(null)
  const [locked, setLocked] = useState(false)
  const [bookmarks, setBookmarks] = useState(loadBookmarks)

  useEffect(() => {
    // 辞書本体は認証付き Function 経由でのみ取得。トークンが無ければロック画面へ。
    if (!token) {
      setLocked(true)
      return
    }

    let cancelled = false
    fetchAppData(token)
      .then(async (raw) => {
        if (cancelled) return
        const initialData = validateAppData(raw)
        setData(initialData)

        // 保存済みシート編集を反映するライブ同期 (任意・非ブロッキング)。
        try {
          const liveWords = await fetchEditorWords(token)
          if (cancelled) return
          setData({
            ...initialData,
            numbers: mergeNumberEntries(initialData.numbers, liveWords),
          })
        } catch {
          // 静的スナップショットのまま利用可能。
        }
      })
      .catch(() => {
        // 401 (無効トークン) やネットワーク失敗はロック画面へ。
        if (!cancelled) setLocked(true)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const toggleBm = useCallback((key: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveBookmarks(next)
      return next
    })
  }, [])

  if (locked) {
    return <LockedScreen invalid={Boolean(token)} />
  }

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
          token={token}
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
        {token && (
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
