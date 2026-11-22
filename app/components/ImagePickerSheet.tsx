// 画像ピッカーのボトムシート (D-0088: A-1 / B-2 / D-2、作り直し D-0109)。
// «今» + 候補 5 枚の 3×2 から 1 枚を選び、その画像の切り抜きを決めて «保存» する。
// 選んでいる画像と画像ごとの切り抜きは下書きで、保存するまで何も変わらない
// (別の画像を選んでも切り抜きは消えない)。保存した枠は確定 (一括の取り直しで上書きされない) になる。
// 何も変えずに今の画像で良ければ «✓ これで良い» で確定だけする。
// 使い方と、状態ごとに押せるボタンは .metarc/image-picker-usecases.md。
//
// 画面の上半分に指を伸ばさない規約 (docs/screen-layout.md) に合わせ、シートは下端に出し、
// 保存・閉じるは最下段に置く。
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cropImageStyle } from '../lib/cropRect'
import {
  fetchCandidates,
  fetchSlotState,
  CROP_BUTTONS,
  cropSourceOf,
  isLockedError,
  pickImage,
  recropImage,
  setKeep,
  setImageOverride,
  StoppedError,
  type SlotImage,
} from '../lib/imagePicker'
import { useNumberContext } from '../lib/numberContext'
import { buildSearchWord } from '../lib/searchWord'
import { wordImage } from '../lib/wordImage'
import CropEditor, { type CropChoice } from './CropEditor'
import TaggedWord from './TaggedWord'

// 3×2 の 1 枠は «今» なので、候補は 5 枚まで並べる
const SHOWN_CANDIDATES = 5
const TILE_PX = 110

type Props = {
  token: string
  id: string
  /** 画像データの枠名 (w1 / w2_2 / w1_2#res など) */
  slot: string
  word: string
  current: SlotImage | null
  /** 確定 (ロック) 済みか。分からなければ省く (開いたときに今の画像と一緒に取り直す) */
  kept?: boolean
  /** 前に取って残っている候補の数 (候補タブの state.choices)。あれば開いたときにそれを出す */
  choices?: number
  onClose: () => void
  onPicked?: (image: SlotImage) => void
  /** 確定を付け外した */
  onKeep?: (on: boolean) => void
}

type Loaded = { query: string; candidates: SlotImage[]; reused: boolean }

/** 走っている検索。auto は開いたときの自動の検索 */
type Searching = { query: string; isAuto: boolean; startedAt: number }

/** 何で検索しているか・何秒たったかを出す帯 (開いた瞬間に検索が走っているのが見えるように) */
function SearchStatus({ searching }: { searching: Searching }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - searching.startedAt) / 1000))
  return (
    <div class="ip-status" role="status">
      <span class="ip-spinner" aria-hidden="true" />
      <div class="ip-status-text">
        <div class="ip-status-main">
          {searching.query ? `«${searching.query}» で` : ''}
          {searching.isAuto ? '自動で検索中' : '検索中'}
        </div>
        <div class="ip-status-sub">
          候補の画像を取り込んでいます · {seconds}秒
        </div>
      </div>
    </div>
  )
}

/** 切り抜きの決め方を短く (タイルの札・ボタンの横に出す) */
function cropLabel(choice: CropChoice) {
  if (!choice) return ''
  // 寄せ方のボタンで置いたまま動かしていなければ、その寄せ方で出す
  if ('rect' in choice && !choice.position) return '手動'
  return (
    CROP_BUTTONS.find((b) => b.position === choice.position)?.label ?? ''
  ).replace(/^\S+ /, '')
}

function Tile({
  image,
  word,
  label,
  crop,
  isSelected,
  isDisabled = false,
  onSelect,
}: {
  image: SlotImage | null
  word: string
  label?: string
  /** 決めた切り抜き (保存前の下書き)。元画像で範囲だけ見せる */
  crop?: CropChoice
  isSelected: boolean
  isDisabled?: boolean
  onSelect: () => void
}) {
  const rect = crop && 'rect' in crop ? crop.rect : null
  return (
    <button
      type="button"
      class={'ip-tile' + (isSelected ? ' is-selected' : '')}
      aria-pressed={isSelected}
      disabled={isDisabled}
      onClick={onSelect}
    >
      {image && rect && cropSourceOf(image) ? (
        <img
          src={cropSourceOf(image)}
          alt=""
          referrerpolicy="no-referrer"
          style={cropImageStyle(rect)}
        />
      ) : image ? (
        <img {...wordImage(image.url, TILE_PX, word)} alt="" />
      ) : (
        <span class="ip-tile-empty">画像なし</span>
      )}
      {label ? <span class="ip-tile-label">{label}</span> : null}
      {crop ? <span class="ip-tile-crop">{cropLabel(crop)}</span> : null}
    </button>
  )
}

/** «今» のタイルの鍵 (候補は画像の hash。hash は空にならない) */
const CURRENT = ''

/**
 * 画面の状態 (.metarc/image-picker-usecases.md の 状態×ボタン 表)。
 * loading: 確定済みか・元画像をまだ取っている / searching: 候補を探している / saving: 保存している
 */
type Phase = 'loading' | 'idle' | 'searching' | 'saving'

export default function ImagePickerSheet({
  token,
  id,
  slot,
  word,
  current,
  kept,
  choices = 0,
  onClose,
  onPicked,
  onKeep,
}: Props) {
  const [isLocked, setIsLocked] = useState(kept ?? false)
  const [isStateReady, setIsStateReady] = useState(kept !== undefined)
  const [currentImage, setCurrentImage] = useState(current)
  // 検索は必ず正式名 (tagTitles = シートの title) で展開する。表示用の略称 (tagNames) は使わない
  const tagMap = useNumberContext()?.tagTitles ?? {}
  const autoQuery = buildSearchWord(word, tagMap)
  const [query, setQuery] = useState(autoQuery)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [searching, setSearching] = useState<Searching | null>(null)
  const [isStopped, setIsStopped] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // ── 下書き: 選んでいる 1 枚と、画像ごとの切り抜き。別の画像を選んでも切り抜きは消さない ──
  const [selected, setSelected] = useState<SlotImage | null>(null)
  const [crops, setCrops] = useState<Record<string, CropChoice>>({})
  const [isEditing, setIsEditing] = useState(false)
  const stopRef = useRef<AbortController | null>(null)
  // 押した瞬間に次の押下を止める (状態の反映は再描画の後なので、連打の 2 回目が通ってしまう)
  const busyRef = useRef(false)
  // 検索中に検索ワードを打ち始めたら、返ってきた検索ワードで上書きしない
  const isEditedRef = useRef(false)

  const phase: Phase = !isStateReady
    ? 'loading'
    : isSaving
      ? 'saving'
      : searching
        ? 'searching'
        : 'idle'
  const selectedKey = selected?.hash ?? CURRENT
  const selectedImage = selected ?? currentImage
  const selectedCrop = crops[selectedKey] ?? null
  /** 保存するもの: 今と違う画像を選んだ、または選んでいる画像の切り抜きを決めた */
  const isDirty = selected !== null || selectedCrop !== null
  /** 捨てると失うもの (閉じるときに確かめる) */
  const hasDraft = isDirty || Object.values(crops).some(Boolean)
  const canEdit =
    (phase === 'idle' || phase === 'searching') &&
    Boolean(cropSourceOf(selectedImage))

  /** 押せる処理を 1 つだけ走らせる。走っている間の押下は無視 */
  const runOnce = async (task: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      await task()
    } finally {
      busyRef.current = false
    }
  }

  const showError = (label: string, err: unknown) => {
    console.error(label, id, slot, err)
    setError(String((err as Error).message || err))
  }

  /** 確定を外す。確定済みの枠は Function が候補の取得・差し替えを断るので、探す前・保存の前に外す */
  const unlockIfLocked = async () => {
    if (!isLocked) return
    await setKeep({ token, id, slot, on: false })
    setIsLocked(false)
    onKeep?.(false)
  }

  /**
   * typed を省くと語から (サーバがタグの最新の正式名で) 検索ワードを作る。
   * reuseOnly は前に取った候補を出すだけで、検索はしない (開いただけで検索の回数を使わない)。
   * 下書き (選んでいる画像・切り抜き) は残す
   */
  const load = async (typed?: string, reuseOnly = false) => {
    const stop = new AbortController()
    stopRef.current = stop
    setSearching({
      query: typed ?? query,
      isAuto: typed === undefined,
      startedAt: Date.now(),
    })
    setIsStopped(false)
    isEditedRef.current = false
    setError('')
    try {
      const result = await fetchCandidates({
        token,
        id,
        slot,
        // 自動の検索も、画面で展開した検索ワードを送る。新しい Function は auto を見て
        // 自分の (タグの最新の正式名で作った) 検索ワードを使い、古い Function はこれで探す
        query: typed ?? (autoQuery || undefined),
        auto: typed === undefined,
        reuse: reuseOnly,
        reuseOnly,
        stop: stop.signal,
      })
      // 前に取った候補が無い・今の検索ワードと違う (タグを展開できなかった頃の候補) ときは出さない
      if (reuseOnly && !result.reused) return
      if (
        result.reused &&
        result.query === buildSearchWord(word) &&
        result.query !== autoQuery
      )
        return
      setLoaded({
        query: result.query,
        candidates: result.candidates,
        reused: Boolean(result.reused),
      })
      if (!isEditedRef.current && result.query) setQuery(result.query)
    } catch (err) {
      if (err instanceof StoppedError) setIsStopped(true)
      else if (isLockedError(err)) setIsLocked(true)
      else showError('candidates', err)
    } finally {
      if (stopRef.current === stop) {
        stopRef.current = null
        setSearching(null)
      }
    }
  }

  const search = () =>
    runOnce(async () => {
      if (phase !== 'idle') return
      // 語から作った検索ワードのままなら «自動» として送る (Function がタグの最新の正式名で作り直す)
      const typed = query.trim()
      const sent = typed && typed !== autoQuery ? typed : undefined
      // 確定を外している間も «検索中» にして、検索のボタンを押せなくする
      setSearching({
        query: sent ?? query,
        isAuto: !sent,
        startedAt: Date.now(),
      })
      try {
        await unlockIfLocked()
      } catch (err) {
        setSearching(null)
        return showError('unkeep', err)
      }
      await load(sent)
    })

  useEffect(() => {
    if (isStateReady) return
    let isAlive = true
    fetchSlotState(token, id, slot)
      .then((state) => {
        if (!isAlive) return
        if (state.image) setCurrentImage(state.image)
        setIsLocked(state.kept)
        setIsStateReady(true)
      })
      .catch((err) => {
        if (!isAlive) return
        showError('slot state', err)
      })
    return () => {
      isAlive = false
    }
  }, [])

  useEffect(() => {
    // 開いただけでは検索しない (検索の回数を使わない)。前に取った候補が残っている枠だけ出す
    if (!isLocked && choices > 0) load(undefined, true)
    // 閉じたら待つのをやめる
    return () => stopRef.current?.abort()
  }, [])

  const adopt = (image: SlotImage) => {
    setCurrentImage(image)
    setImageOverride(id, slot, image)
    onPicked?.(image)
  }

  /**
   * 下書き (選んだ画像と、その画像の切り抜き) を保存して閉じる。保存した枠は確定 (一括の取り直しで
   * 上書きされない) にする。途中で失敗したら、そこまで済んだ分を «今» に反映して下書きは残す
   */
  const save = () =>
    runOnce(async () => {
      if (phase !== 'idle' || !isDirty) return
      setIsSaving(true)
      setError('')
      let crop = selectedCrop
      try {
        await unlockIfLocked()
        if (selected) {
          adopt(await pickImage({ token, id, slot, hash: selected.hash }))
          // 採用した画像は «今» になる。切り抜きも «今» の分として持ち直す
          setSelected(null)
          setCrops((prev) => ({ ...prev, [CURRENT]: crop }))
        }
        if (crop) {
          adopt(
            await recropImage({
              token,
              id,
              slot,
              ...('rect' in crop
                ? { rect: crop.rect }
                : { position: crop.position }),
            })
          )
          crop = null
          setCrops((prev) => ({ ...prev, [CURRENT]: null }))
        }
        await setKeep({ token, id, slot, on: true })
        setIsLocked(true)
        onKeep?.(true)
        onClose()
      } catch (err) {
        showError('save', err)
      } finally {
        setIsSaving(false)
      }
    })

  /** 審査 (UC-1): 今の画像のまま «これで良い» と決める */
  const approve = () =>
    runOnce(async () => {
      if (phase !== 'idle' || isDirty || isLocked) return
      setIsSaving(true)
      setError('')
      try {
        await setKeep({ token, id, slot, on: true })
        setIsLocked(true)
        onKeep?.(true)
        onClose()
      } catch (err) {
        showError('keep', err)
      } finally {
        setIsSaving(false)
      }
    })

  const close = () => {
    if (phase === 'saving') return
    if (hasDraft && !confirm('選んだ画像・切り抜きを保存せずに閉じますか？'))
      return
    onClose()
  }

  const listed = loaded?.candidates.slice(0, SHOWN_CANDIDATES) ?? []
  // 選んでいる候補は、検索し直して一覧から外れても先頭に残す (下書きを消さない)
  const candidates =
    selected && !listed.some((c) => c.hash === selected.hash)
      ? [selected, ...listed].slice(0, SHOWN_CANDIDATES)
      : listed
  const canPickTile = phase === 'idle' || phase === 'searching'
  const select = (image: SlotImage | null) => {
    if (!canPickTile) return
    // 選んでいるタイルをもう一度押すと全画面で切り抜きを見る
    if ((image?.hash ?? CURRENT) === selectedKey) {
      if (canEdit) setIsEditing(true)
      return
    }
    setSelected(image)
  }
  const placeholders =
    phase === 'searching'
      ? Array.from(
          { length: SHOWN_CANDIDATES - candidates.length },
          (_, i) => i
        )
      : []

  return createPortal(
    <div class="ip-root">
      <div class="ip-shade" onClick={close} />
      <div class="ip-sheet" role="dialog" aria-label={`${id} の画像を選ぶ`}>
        <div class="ip-head">
          <span class="ip-id">{id}</span>
          <span class="ip-word">
            <TaggedWord word={word} />
          </span>
          {isLocked ? <span class="ip-kept">確定済み</span> : null}
        </div>
        <form
          class="ip-query"
          onSubmit={(e) => {
            e.preventDefault()
            search()
          }}
        >
          <input
            id="ip-query-input"
            type="search"
            value={query}
            placeholder="検索ワード"
            onInput={(e) => {
              isEditedRef.current = true
              setQuery((e.target as HTMLInputElement).value)
            }}
          />
          {/* 検索中は同じ場所のボタンを «中断» にする。key を分けて別の要素にする: 同じ要素を
              使い回すと、中断で再描画された直後に押した要素が送信ボタンに変わり、再検索が走る */}
          {phase === 'searching' ? (
            <button
              key="stop"
              class="filter-btn ip-stop"
              type="button"
              onClick={() => stopRef.current?.abort()}
            >
              中断
            </button>
          ) : (
            <button
              key="search"
              class="filter-btn"
              type="submit"
              disabled={phase !== 'idle'}
            >
              {loaded ? '再検索' : '検索'}
            </button>
          )}
        </form>
        {searching ? (
          <SearchStatus searching={searching} />
        ) : isStopped ? (
          <div class="ip-status-note">
            検索を止めました。«再検索» で取り直せます
          </div>
        ) : loaded?.reused ? (
          <div class="ip-status-note">
            前に取った候補です。«再検索» で新しく探せます
          </div>
        ) : !loaded ? (
          <div class="ip-status-note">
            «今» を押して切り抜きを直すか、«検索» で別の画像を探します
          </div>
        ) : null}
        <div class="ip-grid">
          <Tile
            image={currentImage}
            word={word}
            label="今"
            crop={crops[CURRENT] ?? undefined}
            isSelected={selected === null}
            isDisabled={!canPickTile}
            onSelect={() => select(null)}
          />
          {candidates.map((image) => (
            <Tile
              key={image.hash}
              image={image}
              word={word}
              crop={crops[image.hash] ?? undefined}
              isSelected={selected?.hash === image.hash}
              isDisabled={!canPickTile}
              onSelect={() => select(image)}
            />
          ))}
          {placeholders.map((i) => (
            <span key={i} class="ip-tile is-loading" />
          ))}
        </div>
        {/* 選んでいる画像の元画像を全画面で出して、切り抜きの寄せ・範囲を決める */}
        <div class="ip-tools">
          <span class="ip-tools-label">
            {selected ? '選んだ候補' : '今の画像'} の切り抜き:{' '}
            {selectedCrop ? cropLabel(selectedCrop) : '自動'}
          </span>
          <button
            class="filter-btn"
            type="button"
            disabled={!canEdit}
            onClick={() => setIsEditing(true)}
            title={
              cropSourceOf(selectedImage)
                ? '元画像を全画面で出して、切り抜く範囲を決める'
                : '元画像が残っていない画像は切り抜けません'
            }
          >
            ⤢ 切り抜き
          </button>
        </div>
        {error ? <div class="ip-error">{error}</div> : null}
        <div class="ip-foot">
          <button
            class="filter-btn"
            type="button"
            disabled={phase === 'saving'}
            onClick={close}
          >
            閉じる
          </button>
          {isDirty ? (
            <button
              class="filter-btn ip-decide"
              type="button"
              disabled={phase !== 'idle'}
              onClick={save}
              title="選んだ画像と切り抜きを保存する。保存した枠は一括の取り直しで上書きされない"
            >
              {phase === 'saving' ? '保存中…' : '保存'}
            </button>
          ) : !isLocked ? (
            <button
              class="filter-btn ip-decide"
              type="button"
              disabled={phase !== 'idle' || !currentImage}
              onClick={approve}
              title="今の画像のまま確定する。確定した枠は一括の取り直しで上書きされない"
            >
              {phase === 'saving' ? '保存中…' : '✓ これで良い'}
            </button>
          ) : null}
        </div>
      </div>
      {isEditing && selectedImage ? (
        <CropEditor
          image={selectedImage}
          title={`${id} ${word}`}
          choice={selectedCrop}
          onCancel={() => setIsEditing(false)}
          onApply={(choice) => {
            setCrops((prev) => ({ ...prev, [selectedKey]: choice }))
            setIsEditing(false)
          }}
        />
      ) : null}
    </div>,
    document.body
  )
}
