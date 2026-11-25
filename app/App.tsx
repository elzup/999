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
import { lazy, Suspense } from 'preact/compat'
import NumGroupTab from './components/NumGroupTab'
import SlideTestGroup from './components/SlideTestGroup'
import {
  cardDeck,
  gogenDeck,
  kukuDeck,
  piDeck,
  yearDeck,
} from './components/slideDecks'
import NumberDetailTab from './components/NumberDetailTab'
import LockedScreen from './components/LockedScreen'
import { consumeEditorTokenFromUrl } from './lib/editorAuth'
import { refreshSessionToken } from './lib/passkeyApi'
import {
  fetchAppData,
  fetchAppNumberEntry,
  UnauthorizedError,
  type AppDataProgress,
} from './lib/appDataApi'
import { setFfRows, type FfRow } from './lib/ffQuiz'
import { setKukuItems } from './lib/kukuQuiz'
import type { KukuItem } from './lib/kukuQuiz'
import { isBookmarkReviewDue } from './lib/bookmarkReview'
import { useBackGuard } from './lib/useBackGuard'
import { listenWriteQueue } from './lib/writeQueue'
import {
  ensureServerImages,
  imageSaveQueue,
  refreshServerImages,
} from './lib/imagePicker'
import { parseNumberEntry, withNumberEntry } from './lib/liveEntry'
import { NumberContext, type NumberContextValue } from './lib/numberContext'
import {
  IconNum,
  IconDate,
  IconCard,
  IconPi,
  IconYear,
  IconWeekday,
  IconKuku,
  IconBook,
  IconStats,
  IconStar,
  IconSlide,
  IconHex,
  IconEdit,
  IconImage,
} from './components/Icons'
import { TagNamesContext, TagTitlesContext } from './lib/tagNames'
import { ReadingTablesContext, tablesFromRules } from './lib/reading'

// 起動直後に開かないタブは別ファイルに分け、開いたときに読む (初回の JS を減らす)。
// 既定の num と、どの画面からも開く編集 (NumberDetailTab) は先に読んでおく
const DateTab = lazy(() => import('./components/DateTab'))
const CardTab = lazy(() => import('./components/CardTab'))
const PiTab = lazy(() => import('./components/PiTab'))
const YearTab = lazy(() => import('./components/YearTab'))
const WeekdayTab = lazy(() => import('./components/WeekdayTab'))
const MiscTab = lazy(() => import('./components/MiscTab'))
const KukuTab = lazy(() => import('./components/KukuTab'))
const SlideshowTab = lazy(() => import('./components/SlideshowTab'))
const GogenTab = lazy(() => import('./components/GogenTab'))
const BookmarkTab = lazy(() => import('./components/BookmarkTab'))
const FFTab = lazy(() => import('./components/FFTab'))
const PickTab = lazy(() => import('./components/PickTab'))

// 配信データにタグ名が無いとき用。毎描画で新しい {} を作ると context の購読側が全部描き直すので固定する
const NO_TAG_NAMES: Record<string, string> = {}

const TAB_ICONS: Record<TabId, preact.JSX.Element> = {
  num: <IconNum />,
  date: <IconDate />,
  card: <IconCard />,
  pi: <IconPi />,
  year: <IconYear />,
  weekday: <IconWeekday />,
  kuku: <IconKuku />,
  gogen: <IconBook />,
  slide: <IconSlide />,
  bm: <IconStar />,
  hex: <IconHex />,
  edit: <IconEdit />,
  cand: <IconImage />,
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
  // 保存の購読は描画の外で動くので、最新の辞書データを ref で読めるようにする
  const dataRef = useRef<AppData | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])
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
        // 開くたびに通行証の期限を延ばす。使い続けている限りパスキーを求めない
        void refreshSessionToken(token)
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

  // 保存が済んだ番号は、読み込み済みの辞書データ (一覧・詳細・テストが読む) も差し替える。
  // 辞書データは deploy のときの写しなので、差し替えないと次の起動まで古い語のまま出る
  useEffect(() => {
    if (!token) return
    // 画像の正本 (imageSlots) も読み込み、どの画面も同じ画像を出す (imageStore.ts)
    ensureServerImages(token)
    // 端末に残った画像の保存は、画像の画面を開かなくても起動した時点で送り始める
    imageSaveQueue()
    return listenWriteQueue({
      onSettled: (num) => {
        // 並べ替え・移動はサーバが画像を語と同じ枠へ動かすので読み直す
        refreshServerImages(token)
        fetchAppNumberEntry(num, token)
          .then((raw) => {
            const entry = parseNumberEntry(raw)
            if (!entry) return
            const current = dataRef.current
            if (!current) return
            const next = withNumberEntry(current, entry)
            if (next === current) return
            dataRef.current = next
            // 差し替えた中身もキャッシュへ書く。書かないと、次の起動で保存前の語に戻って見える
            saveAppDataCache(JSON.stringify(next))
            setData(next)
          })
          // 差し替えられなくても保存は済んでいる。次に開いたときサーバが最新を重ねて返す
          .catch((error) => console.error('app/numbers', num, error))
      },
    })
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
  const [overlayEdit, setOverlayEdit] = useState<{
    num: string
    slot?: string
  } | null>(null)
  const overlayEditNum = overlayEdit?.num ?? null
  const openOverlayEditor = useCallback(
    (num: string, slot?: string) => setOverlayEdit({ num, slot }),
    []
  )
  const [editVersion, setEditVersion] = useState(0)
  const closeOverlayEditor = useCallback(() => {
    setOverlayEdit(null)
    setEditVersion((v) => v + 1)
  }, [])
  useBackGuard(Boolean(overlayEditNum), closeOverlayEditor)

  const readingTables = useMemo(
    () => (data?.rules ? tablesFromRules(data.rules) : null),
    [data?.rules]
  )

  const numberCtx = useMemo<NumberContextValue>(
    () => ({
      numbers: data?.numbers ?? [],
      bookmarks,
      onToggleBm: toggleBm,
      openEditor: openOverlayEditor,
      editVersion,
      tagNames: data?.tagNames,
      tagTitles: data?.tagTitles,
      token,
    }),
    [data, bookmarks, toggleBm, openOverlayEditor, editVersion, token]
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
            gogen: gogenDeck(),
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
      <TagNamesContext.Provider value={data.tagNames ?? NO_TAG_NAMES}>
        <TagTitlesContext.Provider value={data.tagTitles ?? NO_TAG_NAMES}>
          <ReadingTablesContext.Provider value={readingTables}>
            {revalidating && <div class="revalidating-note">更新を確認中…</div>}
            {/* 遅延タブの読み込み中も Tab Bar は出したままにする (fallback は空) */}
            <Suspense fallback={null}>
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
              {tab === 'date' && (
                <DateTab
                  numbers={data.numbers}
                  dates={data.dates}
                  bookmarks={bookmarks}
                  onToggleBm={toggleBm}
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
                <SlideTestGroup
                  group="year"
                  mainLabel="年号"
                  deck={slideDecks.year}
                >
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
                <SlideTestGroup
                  group="kuku"
                  mainLabel="九九"
                  deck={slideDecks.kuku}
                >
                  <KukuTab />
                </SlideTestGroup>
              )}
              {tab === 'gogen' && (
                <SlideTestGroup
                  group="gogen"
                  mainLabel="語源"
                  deck={slideDecks.gogen}
                >
                  <GogenTab />
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
                  numbers={data.numbers}
                  rules={data.rules}
                  // 戻る (popstate) が実際の状態遷移を行う。ここで直接閉じると
                  // 積んだ履歴が 1 つ残り、次の «戻る» が空振りする
                  onClose={editTarget ? closeEditor : undefined}
                />
              )}
              {tab === 'cand' && (
                <PickTab token={token} numbers={data.numbers} />
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
            </Suspense>
            <div class="bottom-bar">
              {VALID_TABS.filter((id) => visibility[id] || tab === id).map(
                (id) => (
                  <TabButton
                    key={id}
                    id={id}
                    current={tab}
                    onSelect={setTab}
                    icon={TAB_ICONS[id]}
                    label={BAR_TAB_LABELS[id]}
                    highlight={id === 'bm' ? bmReviewDue : undefined}
                  />
                )
              )}
            </div>
            {overlayEditNum ? (
              <div class="edit-overlay">
                <NumberDetailTab
                  token={token}
                  initialNum={overlayEditNum}
                  focusSlot={overlayEdit?.slot}
                  numbers={data.numbers}
                  rules={data.rules}
                  onClose={closeOverlayEditor}
                />
              </div>
            ) : null}
          </ReadingTablesContext.Provider>
        </TagTitlesContext.Provider>
      </TagNamesContext.Provider>
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
