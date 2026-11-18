// 候補タブ (D-0089)。画像コンソール (/console/) の一括編集をアプリのタブにしたもの。
// 撮り直し・未取得の枠を 3 列で並べ、押すとボトムシート (ImagePickerSheet) で候補から選ぶ。
// 選んで閉じると一覧の同じ位置に戻るので、次の枠を続けて直せる (C-3)。
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  CANDIDATE_FILTERS,
  candidateItems,
  fetchImageState,
  type CandidateFilter,
  type CandidateItem,
  type ImageState,
  type SlotImage,
} from '../lib/imagePicker'
import { loadSubTab, saveSubTab } from '../data/storage'
import { wordImage } from '../lib/wordImage'
import ImagePickerSheet from './ImagePickerSheet'
import Screen, { DockBar, DockRow } from './Screen'

const FILTER_KEY = 'cand.filter'
const COLS = 3
// «全部» は 2000 枠を超える。画像を一度に並べすぎないよう先頭だけ出す
const MAX_SHOWN = 300
const THUMB_PX = 120

type Props = { token: string }

function ItemCard({
  item,
  onOpen,
}: {
  item: CandidateItem
  onOpen: () => void
}) {
  return (
    <button type="button" class="cand-card" onClick={onOpen}>
      <span class="cand-thumb">
        {item.image ? (
          <img
            {...wordImage(item.image.url, THUMB_PX, item.word)}
            alt=""
            loading="lazy"
          />
        ) : (
          <span class="cand-thumb-empty">未取得</span>
        )}
        {item.keep ? <span class="cand-badge is-keep">確定</span> : null}
        {item.redo ? <span class="cand-badge is-redo">撮り直し</span> : null}
      </span>
      <span class="cand-head">
        <span class="cand-id">{item.id}</span>
        <span class="cand-slot">{item.slotName}</span>
      </span>
      <span class="cand-word">{item.word}</span>
    </button>
  )
}

const FILTER_IDS = CANDIDATE_FILTERS.map((f) => f.id)

export default function CandidateTab({ token }: Props) {
  const [state, setState] = useState<ImageState | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<CandidateFilter>(() =>
    loadSubTab(FILTER_KEY, FILTER_IDS, 'redo')
  )
  const [open, setOpen] = useState<CandidateItem | null>(null)

  const load = async () => {
    setError('')
    try {
      setState(await fetchImageState(token))
    } catch (err) {
      console.error('candidate state', err)
      setError(String((err as Error).message || err))
    }
  }

  useEffect(() => {
    if (token) load()
  }, [token])

  const items = useMemo(
    () => (state ? candidateItems(state, filter) : []),
    [state, filter]
  )
  const shown = items.slice(0, MAX_SHOWN)

  const choose = (next: CandidateFilter) => {
    saveSubTab(FILTER_KEY, next)
    setFilter(next)
  }

  /** 選んだ画像を一覧に反映する (撮り直しの印は Function が外している) */
  const picked = (item: CandidateItem, image: SlotImage) => {
    setState((prev) => {
      if (!prev) return prev
      const key = `${item.id}:${item.slot}`
      const { [key]: _done, ...redo } = prev.redo
      return {
        ...prev,
        images: {
          ...prev.images,
          [item.id]: { ...prev.images[item.id], [item.slot]: image },
        },
        redo,
      }
    })
  }

  const message = !token
    ? '設定 > 認証 でログインすると使えます'
    : error ||
      (state
        ? items.length === 0
          ? 'この絞り込みの枠はありません'
          : ''
        : '読み込み中…')

  return (
    <>
      <Screen
        main={
          <div
            class="cand-grid grid-up"
            style={{ '--cols': COLS, '--gap': '6px' }}
          >
            {shown.map((item) => (
              <ItemCard
                key={`${item.id}:${item.slot}`}
                item={item}
                onOpen={() => setOpen(item)}
              />
            ))}
            {message ? <div class="cand-note grid-full">{message}</div> : null}
          </div>
        }
        dock={
          <>
            <DockBar
              title="候補"
              sub={
                state
                  ? `${items.length} 枠${
                      items.length > MAX_SHOWN ? ` (先頭 ${MAX_SHOWN})` : ''
                    }`
                  : undefined
              }
            >
              <button class="filter-btn" type="button" onClick={load}>
                読み直す
              </button>
            </DockBar>
            <DockRow>
              {CANDIDATE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  class={'filter-btn' + (filter === f.id ? ' active' : '')}
                  onClick={() => choose(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </DockRow>
          </>
        }
      />
      {open ? (
        <ImagePickerSheet
          key={`${open.id}:${open.slot}`}
          token={token}
          id={open.id}
          slot={open.slot}
          word={open.word}
          current={open.image}
          onClose={() => setOpen(null)}
          onPicked={(image) => picked(open, image)}
        />
      ) : null}
    </>
  )
}
