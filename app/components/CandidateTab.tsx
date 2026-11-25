// 候補タブ (D-0089)。画像コンソール (/console/) の一括編集をアプリのタブにしたもの。
// 撮り直し・未取得の枠を 3 列で並べ、押すとボトムシート (ImagePickerSheet) で候補から選ぶ。
// 選んで閉じると一覧の同じ位置に戻るので、次の枠を続けて直せる (C-3)。
// 代表と同じタブで切り替える (PickTab)。番号は百の位ごとに出し、十の位へ飛べる。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import {
  CANDIDATE_FILTERS,
  appSlotOf,
  candidateItems,
  fetchImageState,
  keepOpened,
  setRedo,
  useImageOverride,
  useImageSave,
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
import { Segmented } from './Segmented'
import { useNumberContext } from '../lib/numberContext'
import { writeQueue } from '../lib/writeQueue'

const FILTER_KEY = 'cand.filter'
const KIND_KEY = 'cand.kind'
const KINDS = ['num', 'date', 'card'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABELS: Record<Kind, string> = {
  num: '番号',
  date: '日付',
  card: 'カード',
}
const KIND_OPTIONS = KINDS.map((id) => ({ id, label: KIND_LABELS[id] }))
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
  // 保存キューが裏で送っている間も、選んだ画像 (届いたら切り抜き後の画像) を出す
  const picked = useImageOverride(item.id, item.slot, item.word)
  const save = useImageSave(item.id, item.slot)
  const image = picked ?? item.image
  return (
    <button
      type="button"
      class={'cand-card' + (save ? ' save-' + save.state : '')}
      title={save?.state === 'error' ? save.message : undefined}
      onClick={onOpen}
      data-num={/^\d{3}$/.test(item.id) ? item.id : undefined}
    >
      <span class="cand-thumb">
        {image ? (
          <img
            {...wordImage(image.url, THUMB_PX, item.word)}
            alt=""
            loading="lazy"
          />
        ) : (
          <span class="cand-thumb-empty">未取得</span>
        )}
        <span class="cand-badges">
          {save?.state === 'pending' ? (
            <span class="cand-badge is-saving">保存待ち</span>
          ) : null}
          {save?.state === 'error' ? (
            <span class="cand-badge is-save-error">保存できません</span>
          ) : null}
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
        <TaggedWord word={item.word} short />
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
  // このフィルタで開いた枠。確定してフィルタ (未確定など) から外れても、フィルタ・種類を
  // 切り替えるか読み直すまでは同じ位置に残す (確定した直後に開き直して切り抜きを直せるように)
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  const openItem = (item: CandidateItem) => {
    // 画像は «番号:枠の位置» で持つ。並べ替え・移動を送り終えるまでは枠が決まらないので開かない
    if (writeQueue().pendingCount(item.id) > 0) {
      setError(
        `${item.id} は語の並べ替え・移動を保存中です。送り終えてから選んでください`
      )
      return
    }
    setOpened((prev) => new Set(prev).add(`${item.id}:${item.slot}`))
    setOpen(item)
  }
  // 代表から来たら番号を出す。百の位は代表と共有する
  const [kind, setKind] = useState<Kind>(() =>
    anchor ? 'num' : loadSubTab(KIND_KEY, KINDS, 'num')
  )
  const [hundred, setHundred] = useState(() => {
    if (anchor) saveHundred(anchor[0])
    return anchor ? anchor[0] : loadHundred()
  })

  // 検索語の誤りの判定は、検索と同じく正式名 (title) で展開して比べる
  const ctx = useNumberContext()
  const tagTitles = ctx?.tagTitles ?? {}
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
    setOpened(new Set())
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
        ? keepOpened(
            candidateItems(state, 'all', tagTitles),
            candidateItems(state, filter, tagTitles),
            opened
          ).filter(
            (it) =>
              kindOf.get(it.id) === kind &&
              (kind !== 'num' || it.id[0] === hundred)
          )
        : [],
    [state, filter, kind, hundred, kindOf, opened]
  )
  const shown = items.slice(0, MAX_SHOWN)

  const choose = (next: CandidateFilter) => {
    saveSubTab(FILTER_KEY, next)
    setFilter(next)
    setOpened(new Set())
  }

  const chooseKind = (next: Kind) => {
    saveSubTab(KIND_KEY, next)
    setKind(next)
    setOpened(new Set())
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
  // 番号の語だけ語の編集へ移れる (日付・カードの語は編集画面が無い)
  const editWordOf = (id: string, slot: string) => {
    const appSlot = appSlotOf(slot)
    if (!ctx || !appSlot || !/^\d{3}$/.test(id)) return undefined
    return () => ctx.openEditor(id, appSlot)
  }

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
                onOpen={() => openItem(item)}
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
            <Segmented
              label="対象"
              options={KIND_OPTIONS}
              value={kind}
              onChange={chooseKind}
            />
            <Segmented
              label="状態"
              options={CANDIDATE_FILTERS}
              value={filter}
              onChange={choose}
              cols={4}
            />
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
          onEditWord={editWordOf(open.id, open.slot)}
        />
      ) : null}
    </>
  )
}
