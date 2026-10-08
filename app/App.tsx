import { useState, useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { validateAppData } from './data/parse'
import {
  loadBookmarks,
  saveBookmarks,
  loadBookmarkViews,
  saveBookmarkViews,
  loadTab,
  saveTab,
  loadTabVisibility,
  saveTabVisibility,
  loadAppDataCache,
  saveAppDataCache,
  clearAppDataCache,
} from './data/storage'
import type { AppData } from './data/schema'
import type { TabId } from './data/constants'
import { BAR_TAB_LABELS, VALID_TABS } from './data/constants'
import type { TabVisibility } from './data/storage'
import NumGroupTab from './components/NumGroupTab'
import CardTab from './components/CardTab'
import PiTab from './components/PiTab'
import YearTab from './components/YearTab'
import WeekdayTab from './components/WeekdayTab'
import MiscTab from './components/MiscTab'
import KukuTab from './components/KukuTab'
import SlideshowTab from './components/SlideshowTab'
import SlideTestGroup from './components/SlideTestGroup'
import { cardDeck, kukuDeck, piDeck, yearDeck } from './components/slideDecks'
import BookmarkTab from './components/BookmarkTab'
import FFTab from './components/FFTab'
import NumberDetailTab from './components/NumberDetailTab'
import LockedScreen from './components/LockedScreen'
import { consumeEditorTokenFromUrl } from './lib/editorAuth'
import {
  fetchAppData,
  UnauthorizedError,
  type AppDataProgress,
} from './lib/appDataApi'
import { setFfRows, type FfRow } from './lib/ffQuiz'
import { setKukuItems } from './lib/kukuQuiz'
import type { KukuItem } from './lib/kukuQuiz'
import { isBookmarkReviewDue } from './lib/bookmarkReview'
import { useBackGuard } from './lib/useBackGuard'
import { NumberContext, type NumberContextValue } from './lib/numberContext'
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
  IconHex,
  IconEdit,
} from './components/Icons'

const TAB_ICONS: Record<TabId, preact.JSX.Element> = {
  num: <IconNum />,
  card: <IconCard />,
  pi: <IconPi />,
  year: <IconYear />,
  weekday: <IconWeekday />,
  kuku: <IconKuku />,
  slide: <IconSlide />,
  bm: <IconStar />,
  hex: <IconHex />,
  edit: <IconEdit />,
  misc: <IconStats />,
}

export function App() {
  const [tab, _setTab] = useState<TabId>(loadTab)
  const [token] = useState(consumeEditorTokenFromUrl)
  const setTab = useCallback((t: TabId) => {
    saveTab(t)
    _setTab(t)
  }, [])
  const [data, setData] = useState<AppData | null>(null)
  const [locked, setLocked] = useState(false)
  const [progress, setProgress] = useState<AppDataProgress>({
    phase: 'connecting',
  })
  const [revalidating, setRevalidating] = useState(false)
  const [bookmarks, setBookmarks] = useState(loadBookmarks)
  const [bmViews, setBmViews] = useState(loadBookmarkViews)
  const [visibility, setVisibility] = useState(loadTabVisibility)
  // 999 タブで語をタップして編集へ入ったときの行き先 (REQ-NDV-012)
  const [editTarget, setEditTarget] = useState<{
    num: string
    slot?: string
  } | null>(null)

  const openEditor = useCallback(
    (num: string, slot?: string) => {
      setEditTarget({ num, slot })
      setTab('edit')
    },
    [setTab]
  )

  const closeEditor = useCallback(() => {
    setEditTarget(null)
    setTab('num')
  }, [setTab])

  // 端末の «戻る» で編集を閉じる。積まないと PWA ではアプリごと閉じて
  // 編集中の内容が消える (Android のジェスチャーナビで実際に踏んだ)
  useBackGuard(Boolean(editTarget), closeEditor)

  const updateVisibility = useCallback((next: TabVisibility) => {
    saveTabVisibility(next)
    setVisibility(next)
  }, [])

  useEffect(() => {
    // 辞書本体は認証付き Function 経由でのみ取得。トークンが無ければロック画面へ。
    if (!token) {
      setLocked(true)
      return
    }

    let cancelled = false
    let hasData = false
    let cachedText: string | null = null

    const applyData = (raw: unknown) => {
      const parsed = validateAppData(raw)
      // ff / kuku は公開バンドルに焼かず、この認証付き payload で届く。
      // 描画前に注入しないと出題側が空データで動いてしまう
      setFfRows((parsed.ff ?? []) as unknown as FfRow[])
      setKukuItems((parsed.kuku ?? []) as unknown as KukuItem[])
      setData(parsed)
      hasData = true
    }

    // SWR: 前回取得したキャッシュがあれば即表示し、裏で最新を取り直す。
    // 辞書は日次同期なので、表示中に数秒遅れで差し替わる程度は許容する
    const cached = loadAppDataCache()
    if (cached) {
      try {
        applyData(JSON.parse(cached))
        cachedText = cached
        setRevalidating(true)
      } catch {
        // キャッシュが壊れていてもネットワーク取得に倒せばよい
        clearAppDataCache()
      }
    }

    fetchAppData(token, (next) => {
      if (!cancelled) setProgress(next)
    })
      .then(({ text, json }) => {
        if (cancelled) return
        setRevalidating(false)
        // キャッシュと完全一致なら再描画も再保存も要らない
        if (text === cachedText) return
        saveAppDataCache(text)
        applyData(json)
      })
      .catch((error) => {
        if (cancelled) return
        setRevalidating(false)
        // 401 はトークン失効なのでキャッシュ表示中でもロックする。
        // オフライン等の通信失敗でキャッシュ表示済みなら、そのまま使い続ける
        if (error instanceof UnauthorizedError || !hasData) setLocked(true)
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

  // テストの結果ビューから開く編集。タブを切り替えると結果ビューごと消えるので、
  // 今のタブの上に重ねて開き、閉じたら結果ビューへ戻る
  const [overlayEditNum, setOverlayEditNum] = useState<string | null>(null)
  const closeOverlayEditor = useCallback(() => setOverlayEditNum(null), [])
  useBackGuard(Boolean(overlayEditNum), closeOverlayEditor)

  const numberCtx = useMemo<NumberContextValue>(
    () => ({
      numbers: data?.numbers ?? [],
      bookmarks,
      onToggleBm: toggleBm,
      openEditor: setOverlayEditNum,
    }),
    [data, bookmarks, toggleBm]
  )

  // サブタブを持たないグループのスライド用デッキ。kuku は applyData で注入済みの
  // データを読むので、data が差し替わったら作り直す
  const slideDecks = useMemo(
    () =>
      data
        ? {
            card: cardDeck(data.cards),
            pi: piDeck(data.numbers),
            year: yearDeck(),
            kuku: kukuDeck(),
          }
        : null,
    [data]
  )

  const bmReviewDue = isBookmarkReviewDue(bookmarks, bmViews, Date.now())

  if (locked) {
    return <LockedScreen invalid={Boolean(token)} />
  }

  if (!data || !slideDecks) {
    return <LoadingScreen progress={progress} />
  }

  return (
    <NumberContext.Provider value={numberCtx}>
      {revalidating && <div class="revalidating-note">更新を確認中…</div>}
      {tab === 'num' && (
        <NumGroupTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
          rules={data.rules}
          yomiUse={data.yomiUse}
          onEditWord={openEditor}
        />
      )}
      {tab === 'card' && (
        <SlideTestGroup
          group="card"
          mainLabel="カード"
          deck={slideDecks.card}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        >
          <CardTab
            cards={data.cards}
            bookmarks={bookmarks}
            onToggleBm={toggleBm}
          />
        </SlideTestGroup>
      )}
      {tab === 'pi' && (
        <SlideTestGroup
          group="pi"
          mainLabel="π"
          deck={slideDecks.pi}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        >
          <PiTab
            numbers={data.numbers}
            bookmarks={bookmarks}
            onToggleBm={toggleBm}
          />
        </SlideTestGroup>
      )}
      {tab === 'year' && (
        <SlideTestGroup group="year" mainLabel="年号" deck={slideDecks.year}>
          <YearTab
            numbers={data.numbers}
            bookmarks={bookmarks}
            onToggleBm={toggleBm}
          />
        </SlideTestGroup>
      )}
      {tab === 'weekday' && (
        <WeekdayTab
          numbers={data.numbers}
          bookmarks={bookmarks}
          onToggleBm={toggleBm}
        />
      )}
      {tab === 'kuku' && (
        <SlideTestGroup group="kuku" mainLabel="九九" deck={slideDecks.kuku}>
          <KukuTab />
        </SlideTestGroup>
      )}
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
      {tab === 'hex' && <FFTab />}
      {tab === 'edit' && (
        <NumberDetailTab
          token={token}
          initialNum={editTarget?.num}
          focusSlot={editTarget?.slot}
          // 戻る (popstate) が実際の状態遷移を行う。ここで直接閉じると
          // 積んだ履歴が 1 つ残り、次の «戻る» が空振りする
          onClose={editTarget ? closeEditor : undefined}
        />
      )}
      {tab === 'misc' && (
        <MiscTab
          numbers={data.numbers}
          rules={data.rules}
          visibility={visibility}
          onVisibilityChange={updateVisibility}
          onSelectTab={setTab}
        />
      )}
      <div class="bottom-bar">
        {VALID_TABS.filter((id) => visibility[id] || tab === id).map((id) => (
          <TabButton
            key={id}
            id={id}
            current={tab}
            onSelect={setTab}
            icon={TAB_ICONS[id]}
            label={BAR_TAB_LABELS[id]}
            highlight={id === 'bm' ? bmReviewDue : undefined}
          />
        ))}
      </div>
      {overlayEditNum ? (
        <div class="edit-overlay">
          <NumberDetailTab
            token={token}
            initialNum={overlayEditNum}
            onClose={closeOverlayEditor}
          />
        </div>
      ) : null}
    </NumberContext.Provider>
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

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

function LoadingScreen({ progress }: { progress: AppDataProgress }) {
  // totalBytes は gzip 配信 (chunked) では取れない。その場合は受信量だけ出す
  const ratio =
    progress.phase === 'downloading' && progress.totalBytes
      ? progress.loadedBytes / progress.totalBytes
      : progress.phase === 'parsing'
      ? 1
      : null

  const label =
    progress.phase === 'connecting'
      ? 'サーバーに接続中…'
      : progress.phase === 'downloading'
      ? progress.totalBytes
        ? `辞書データを受信中… ${Math.round(
            (progress.loadedBytes / progress.totalBytes) * 100
          )}%`
        : `辞書データを受信中… ${formatKb(progress.loadedBytes)}`
      : '辞書データを展開中…'

  return (
    <div class="loading-screen">
      <div class="loading-label">{label}</div>
      <div class="loading-bar">
        <div
          class={'loading-bar-fill' + (ratio === null ? ' indeterminate' : '')}
          style={ratio === null ? undefined : { width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}
