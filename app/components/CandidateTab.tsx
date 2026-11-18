// 候補タブ (D-0089)。画像コンソール (/console/) の一括編集をアプリのタブにしたもの。
// 撮り直し・未取得の枠を 3 列で並べ、押すとボトムシート (ImagePickerSheet) で候補から選ぶ。
// 選んで閉じると一覧の同じ位置に戻るので、次の枠を続けて直せる (C-3)。
// 代表と同じタブで切り替える (PickTab)。番号は百の位ごとに出し、十の位へ飛べる。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import {
  CANDIDATE_FILTERS,
  candidateItems,
  fetchImageState,
  setRedo,
  type CandidateFilter,
  type CandidateItem,
  type ImageState,
  type SlotImage,
} from '../lib/imagePicker'
import { loadSubTab, saveSubTab } from '../data/storage'
import { wordImage } from '../lib/wordImage'
import ImagePickerSheet from './ImagePickerSheet'
import {
  DIGITS,
  anchorTarget,
  loadHundred,
  saveHundred,
  scrollToNum,
} from '../lib/pickPosition'
import Screen, { DockBar, DockRow } from './Screen'
import TaggedWord from './TaggedWord'
import { useNumberContext } from '../lib/numberContext'

const FILTER_KEY = 'cand.filter'
const KIND_KEY = 'cand.kind'
const KINDS = ['num', 'date', 'card'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABELS: Record<Kind, string> = {
  num: '番号',
  date: '日付',
  card: 'カード',
}
const COLS = 3
// 日付の «全部» は 2000 枠を超える。画像を一度に並べすぎないよう先頭だけ出す
// (番号は百の位ごと = 最大 600 枠)
const MAX_SHOWN = 600
const THUMB_PX = 120

type Props = {
  token: string
  /** [代表 | 画像] の切替。dock の見出しの位置に出す */
  modeSwitch?: ComponentChildren
  /** 代表から切り替えてきたときに見ていた番号。その枠の位置で開く */
  anchor?: string | null
}

function ItemCard({
  item,
  onOpen,
}: {
  item: CandidateItem
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      class="cand-card"
      onClick={onOpen}
      data-num={/^\d{3}$/.test(item.id) ? item.id : undefined}
    >
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
        <span class="cand-badges">
          {item.keep ? <span class="cand-badge is-keep">確定</span> : null}
          {item.redo ? <span class="cand-badge is-redo">撮り直し</span> : null}
          {item.changed ? (
            <span class="cand-badge is-changed">語変更</span>
          ) : null}
          {item.choices > 0 && !item.keep ? (
            <span class="cand-badge is-choices">候補 {item.choices}</span>
          ) : null}
          {item.stale ? (
            <span class="cand-badge is-changed">検索語の誤り</span>
          ) : null}
        </span>
      </span>
      <span class="cand-head">
        <span class="cand-id">{item.id}</span>
        <span class="cand-slot">{item.slotName}</span>
      </span>
      <span class="cand-word">
        <TaggedWord word={item.word} />
      </span>
    </button>
  )
}

const FILTER_IDS = CANDIDATE_FILTERS.map((f) => f.id)

export default function CandidateTab({ token, modeSwitch, anchor }: Props) {
  const [state, setState] = useState<ImageState | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<CandidateFilter>(() =>
    loadSubTab(FILTER_KEY, FILTER_IDS, 'redo')
  )
  const [open, setOpen] = useState<CandidateItem | null>(null)
  // 代表から来たら番号を出す。百の位は代表と共有する
  const [kind, setKind] = useState<Kind>(() =>
    anchor ? 'num' : loadSubTab(KIND_KEY, KINDS, 'num')
  )
  const [hundred, setHundred] = useState(() => {
    if (anchor) saveHundred(anchor[0])
    return anchor ? anchor[0] : loadHundred()
  })

  // 検索語の誤りの判定は、検索と同じく正式名 (title) で展開して比べる
  const tagTitles = useNumberContext()?.tagTitles ?? {}
  const [bulk, setBulk] = useState('')
  const [isFlagging, setIsFlagging] = useState(false)

  /**
   * 検索語の誤りの枠に、撮り直しの印をまとめて付ける (確定済みは外す。Function も断る)。
   * 1 枠ずつ順に送る (Function に同時に投げすぎない)
   */
  const flagStale = async () => {
    const targets = items.filter((it) => !it.keep && !it.redo)
    if (!targets.length) return
    setIsFlagging(true)
    let redo = state?.redo ?? {}
    let done = 0
    for (const it of targets) {
      setBulk(`印を付けています ${done}/${targets.length}`)
      try {
        redo = await setRedo({ token, id: it.id, slot: it.slot, on: true })
        done++
      } catch (err) {
        console.error('flag stale', it.id, it.slot, err)
      }
    }
    setState((prev) => (prev ? { ...prev, redo } : prev))
    setIsFlagging(false)
    setBulk(
      `${done}/${targets.length} 枠に撮り直しの印を付けた。ピッカーで開くか、Mac の nr images:redo-flagged で取り直す`
    )
  }

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

  const kindOf = useMemo(
    () => new Map(state?.targets.map((t) => [t.id, t.kind]) ?? []),
    [state]
  )
  const items = useMemo(
    () =>
      state
        ? candidateItems(state, filter, tagTitles).filter(
            (it) =>
              kindOf.get(it.id) === kind &&
              (kind !== 'num' || it.id[0] === hundred)
          )
        : [],
    [state, filter, kind, hundred, kindOf]
  )
  const shown = items.slice(0, MAX_SHOWN)

  const choose = (next: CandidateFilter) => {
    saveSubTab(FILTER_KEY, next)
    setFilter(next)
  }

  const chooseKind = (next: Kind) => {
    saveSubTab(KIND_KEY, next)
    setKind(next)
  }

  const chooseHundred = (next: string) => {
    saveHundred(next)
    setHundred(next)
  }

  // 番号の並びは十の位ごと。押すとその十の位の最初の枠を下端に合わせる
  const nums = [...new Set(shown.map((it) => it.id))]
  const jumpTo = (decade: number) => {
    const target = nums.find((num) => Number(num[1]) >= decade)
    if (target) scrollToNum('.cand-grid', target)
  }

  // 代表から切り替えてきたら、見ていた番号の枠を下端に合わせる (読み込めた後に 1 度だけ)
  const isAnchored = useRef(!anchor)
  useEffect(() => {
    if (isAnchored.current || !anchor || !nums.length) return
    const target = anchorTarget(nums, anchor)
    if (target && scrollToNum('.cand-grid', target)) isAnchored.current = true
  })

  /** 確定の付け外しを一覧に反映する */
  const kept = (item: CandidateItem, on: boolean) => {
    setState((prev) => {
      if (!prev) return prev
      const key = `${item.id}:${item.slot}`
      const { [key]: _was, ...rest } = prev.keep
      return { ...prev, keep: on ? { ...rest, [key]: true } : rest }
    })
  }

  /** 選んだ画像を一覧に反映する (撮り直しの印は Function が外している) */
  const picked = (item: CandidateItem, image: SlotImage) => {
    setState((prev) => {
      if (!prev) return prev
      const key = `${item.id}:${item.slot}`
      const { [key]: _done, ...redo } = prev.redo
      const left = Math.max(0, (prev.choices?.[key] ?? 0) - 1)
      return {
        ...prev,
        // 選んだ候補は残りから外れる。画像は今の語で選び直したので «語変更» も外す
        choices: { ...prev.choices, [key]: left },
        candidates: {
          ...prev.candidates,
          [key]: { ...prev.candidates?.[key], word: item.word },
        },
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
              title={modeSwitch ?? '候補'}
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
            {filter === 'stale' ? (
              <DockRow>
                <span class="dock-row-label cand-bulk-note">
                  {bulk ||
                    'タグを正式名にしないまま検索して取った画像。別物のことがある'}
                </span>
                <button
                  class="filter-btn"
                  type="button"
                  disabled={
                    isFlagging || !items.some((it) => !it.keep && !it.redo)
                  }
                  onClick={flagStale}
                >
                  未確定に撮り直しの印
                </button>
              </DockRow>
            ) : null}
            <div class="rp-filters">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  class={'rp-seg' + (kind === k ? ' active' : '')}
                  aria-pressed={kind === k}
                  onClick={() => chooseKind(k)}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
              <span class="cand-filter-gap" aria-hidden="true" />
              {CANDIDATE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  class={'rp-seg' + (filter === f.id ? ' active' : '')}
                  aria-pressed={filter === f.id}
                  onClick={() => choose(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {kind === 'num' ? (
              <>
                <DockRow>
                  <span class="dock-row-label">百</span>
                  <div class="rp-digits">
                    {DIGITS.map((d) => (
                      <button
                        key={d}
                        class={'rp-digit' + (hundred === d ? ' active' : '')}
                        aria-pressed={hundred === d}
                        onClick={() => chooseHundred(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </DockRow>
                <div class="rp-digits">
                  {DIGITS.map((d, decade) => (
                    <button
                      key={d}
                      class="rp-digit"
                      onClick={() => jumpTo(decade)}
                      disabled={!nums.some((num) => Number(num[1]) === decade)}
                      aria-label={`${hundred}${decade}0 へ`}
                    >
                      {decade}0
                    </button>
                  ))}
                </div>
              </>
            ) : null}
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
          kept={open.keep}
          choices={open.choices}
          onPicked={(image) => picked(open, image)}
          onKeep={(on) => kept(open, on)}
        />
      ) : null}
    </>
  )
}
