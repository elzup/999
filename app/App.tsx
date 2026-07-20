import { useState, useCallback, useEffect } from 'preact/hooks'
import { validateAppData } from './data/parse'
import {
  loadBookmarks,
  saveBookmarks,
  loadBookmarkViews,
  saveBookmarkViews,
  loadTab,
  saveTab,
} from './data/storage'
import type { AppData } from './data/schema'
import type { TabId } from './data/constants'
import NumGroupTab from './components/NumGroupTab'
import CardTab from './components/CardTab'
import PiTab from './components/PiTab'
import YearTab from './components/YearTab'
import WeekdayTab from './components/WeekdayTab'
import MiscTab from './components/MiscTab'
import KukuTab from './components/KukuTab'
import SlideshowTab from './components/SlideshowTab'
import BookmarkTab from './components/BookmarkTab'
import LockedScreen from './components/LockedScreen'
import { consumeEditorTokenFromUrl } from './lib/editorAuth'
import { fetchAppData } from './lib/appDataApi'
import { isBookmarkReviewDue } from './lib/bookmarkReview'
import {
  IconNum,
  IconCard,
  IconPi,
  IconYear,
  IconWeekday,
  IconKuku,
  IconStats,
  IconStar,
  IconSlide,
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
  const [bmViews, setBmViews] = useState(loadBookmarkViews)

  useEffect(() => {
    // 辞書本体は認証付き Function 経由でのみ取得。トークンが無ければロック画面へ。
    if (!token) {
      setLocked(true)
      return
    }

    let cancelled = false
    fetchAppData(token)
      .then((raw) => {
        if (cancelled) return
        setData(validateAppData(raw))
      })
      .catch(() => {
        // 401 (無効トークン) やネットワーク失敗はロック画面へ。
        if (!cancelled) setLocked(true)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const toggleBm = useCallback(
    (key: string) => {
      const adding = !bookmarks.has(key)
      setBookmarks((prev) => {
        const next = new Set(prev)
        if (adding) next.add(key)
        else next.delete(key)
        saveBookmarks(next)
        return next
      })
      // 追加時は「今見た」扱いで閲覧時刻を記録 (新規が即光らないように)。削除時は掃除。
      setBmViews((prev) => {
        const next = { ...prev }
        if (adding) next[key] = Date.now()
        else delete next[key]
        saveBookmarkViews(next)
        return next
      })
    },
    [bookmarks]
  )

  // ブックマークの詳細を開いたら閲覧時刻を更新 (復習グローのリセット)。
  const recordBookmarkView = useCallback((key: string) => {
    setBmViews((prev) => {
      const next = { ...prev, [key]: Date.now() }
      saveBookmarkViews(next)
      return next
    })
  }, [])

  const bmReviewDue = isBookmarkReviewDue(bookmarks, bmViews, Date.now())

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
      {tab === 'slide' && (
        <SlideshowTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'bm' && (
        <BookmarkTab
          numbers={data.numbers}
          cards={data.cards}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
          onView={recordBookmarkView}
        />
      )}
      {tab === 'misc' && <MiscTab numbers={data.numbers} rules={data.rules} />}
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
          id="slide"
          current={tab}
          onSelect={setTab}
          icon={<IconSlide />}
          label="スライド"
        />
        <TabButton
          id="bm"
          current={tab}
          onSelect={setTab}
          icon={<IconStar />}
          label="ブックマーク"
          highlight={bmReviewDue}
        />
        <TabButton
          id="misc"
          current={tab}
          onSelect={setTab}
          icon={<IconStats />}
          label="設定"
        />
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
  highlight,
}: {
  id: TabId
  current: TabId
  onSelect: (t: TabId) => void
  icon: preact.JSX.Element
  label: preact.ComponentChildren
  highlight?: boolean
}) {
  return (
    <button
      class={
        'bar-tab' +
        (current === id ? ' active' : '') +
        (highlight ? ' glow' : '')
      }
      onClick={() => onSelect(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
