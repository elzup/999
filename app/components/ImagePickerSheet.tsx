// 画像ピッカーのボトムシート (D-0088: A-1 / B-2 / D-2)。
// 開くと 1 枠の候補を取り、«今» + 候補 5 枚の 3×2 から選んで «✓ 確定» で採用してロックする (やり直すときは «解除»)。
// 検索ワードを直して取り直せる。候補タブと詳細パネルの画像から開く。
//
// 画面の上半分に指を伸ばさない規約 (docs/screen-layout.md) に合わせ、シートは下端に出し、
// 確定・閉じるは最下段に置く。
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  fetchCandidates,
  CROP_BUTTONS,
  isLockedError,
  pickImage,
  recropImage,
  setKeep,
  setImageOverride,
  StoppedError,
  type CropPosition,
  type SlotImage,
} from '../lib/imagePicker'
import { useNumberContext } from '../lib/numberContext'
import { buildSearchWord } from '../lib/searchWord'
import { wordImage } from '../lib/wordImage'
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
  /** 確定 (ロック) 済みか。分からなければ省く (Function が断ったら確定済みとして出す) */
  kept?: boolean
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

function Tile({
  image,
  word,
  label,
  isSelected,
  onSelect,
}: {
  image: SlotImage | null
  word: string
  label?: string
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      class={'ip-tile' + (isSelected ? ' is-selected' : '')}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      {image ? (
        <img {...wordImage(image.url, TILE_PX, word)} alt="" />
      ) : (
        <span class="ip-tile-empty">画像なし</span>
      )}
      {label ? <span class="ip-tile-label">{label}</span> : null}
    </button>
  )
}

export default function ImagePickerSheet({
  token,
  id,
  slot,
  word,
  current,
  kept = false,
  onClose,
  onPicked,
  onKeep,
}: Props) {
  // 確定済みの枠は候補を取らない (Function も断る)。解除すると選び直せる
  const [isLocked, setIsLocked] = useState(kept)
  // 上寄せで切り抜き直したら «今» の画像が変わる
  const [currentImage, setCurrentImage] = useState(current)
  // 開いた瞬間から検索ワードを出す (サーバが決めた検索ワードが返ってきたら差し替える)
  const tagTitles = useNumberContext()?.tagTitles
  const [query, setQuery] = useState(() => buildSearchWord(word, tagTitles))
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [searching, setSearching] = useState<Searching | null>(null)
  const [isStopped, setIsStopped] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // null は «今» (変えない)
  const [selected, setSelected] = useState<string | null>(null)
  const stopRef = useRef<AbortController | null>(null)
  // 検索中に検索ワードを打ち始めたら、返ってきた検索ワードで上書きしない
  const isEditedRef = useRef(false)
  const isLoading = searching !== null

  /**
   * typed を省くと語から (サーバがタグの最新の正式名で) 検索ワードを作る。
   * reuse なら前に取った候補が残っていればそれを出す (開き直すたびに取り直さない)
   */
  const load = async (typed?: string, reuse = false) => {
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
    setSelected(null)
    try {
      const result = await fetchCandidates({
        token,
        id,
        slot,
        query: typed,
        reuse,
        stop: stop.signal,
      })
      setLoaded({
        query: result.query,
        candidates: result.candidates,
        reused: Boolean(result.reused),
      })
      if (!isEditedRef.current && result.query) setQuery(result.query)
    } catch (err) {
      if (err instanceof StoppedError) {
        setIsStopped(true)
      } else if (isLockedError(err)) {
        setIsLocked(true)
      } else {
        console.error('candidates', id, slot, err)
        setError(String((err as Error).message || err))
      }
    } finally {
      if (stopRef.current === stop) {
        stopRef.current = null
        setSearching(null)
      }
    }
  }

  useEffect(() => {
    if (!isLocked) load(undefined, true)
    // 開いた枠の候補を 1 度だけ取る。枠が変わればシートごと作り直される (key)
    // 閉じたら待つのをやめる
    return () => stopRef.current?.abort()
  }, [])

  /** 失敗を出して、押せる状態に戻す */
  const failed = (label: string, err: unknown) => {
    console.error(label, id, slot, err)
    setError(String((err as Error).message || err))
    setIsSaving(false)
  }

  /** 選んだ画像 («今» なら今の画像) で確定して閉じる */
  const decideAndKeep = async () => {
    setIsSaving(true)
    setError('')
    try {
      if (selected) {
        const image = await pickImage({ token, id, slot, hash: selected })
        setImageOverride(id, slot, image)
        onPicked?.(image)
      }
      await setKeep({ token, id, slot, on: true })
      onKeep?.(true)
      onClose()
    } catch (err) {
      failed('keep', err)
    }
  }

  const unlock = async () => {
    setIsSaving(true)
    setError('')
    try {
      await setKeep({ token, id, slot, on: false })
      onKeep?.(false)
      setIsLocked(false)
      setIsSaving(false)
      load(undefined, true)
    } catch (err) {
      failed('unkeep', err)
    }
  }

  /** 今の画像の元画像を寄せ方を決めて切り抜き直す。採用もこの場で済む (Function が差し替える) */
  const recrop = async (position: CropPosition) => {
    setIsSaving(true)
    setError('')
    try {
      const image = await recropImage({ token, id, slot, position })
      setCurrentImage(image)
      setImageOverride(id, slot, image)
      onPicked?.(image)
      setIsSaving(false)
    } catch (err) {
      failed('recrop', err)
    }
  }

  const candidates = loaded?.candidates.slice(0, SHOWN_CANDIDATES) ?? []
  const placeholders = isLoading
    ? Array.from({ length: SHOWN_CANDIDATES }, (_, i) => i)
    : []

  return createPortal(
    <div class="ip-root">
      <div class="ip-shade" onClick={onClose} />
      <div class="ip-sheet" role="dialog" aria-label={`${id} の画像を選ぶ`}>
        <div class="ip-head">
          <span class="ip-id">{id}</span>
          <span class="ip-word">
            <TaggedWord word={word} />
          </span>
        </div>
        <form
          class="ip-query"
          onSubmit={(e) => {
            e.preventDefault()
            if (!isLoading && !isLocked) load(query.trim() || undefined)
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
          {/* 検索中は同じ場所のボタンを «中断» にする (押せるのに何も起きないボタンを置かない)。
              key を分けて別の要素にする: 同じ要素を使い回すと、中断で再描画された直後に
              押した要素が送信ボタンに変わり、クリックの続きで再検索が走ってしまう */}
          {isLoading ? (
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
              disabled={isLocked}
            >
              再検索
            </button>
          )}
        </form>
        {searching ? (
          <SearchStatus searching={searching} />
        ) : isStopped ? (
          <div class="ip-status-note">
            検索を止めました。«再検索» で取り直せます
          </div>
        ) : isLocked ? (
          <div class="ip-status-note">
            確定済みの枠です。«解除» すると選び直せます
          </div>
        ) : loaded?.reused ? (
          <div class="ip-status-note">
            前に取った候補です。«再検索» で新しく探せます
          </div>
        ) : null}
        <div class="ip-grid">
          <Tile
            image={currentImage}
            word={word}
            label="今"
            isSelected={selected === null}
            onSelect={() => setSelected(null)}
          />
          {candidates.map((image) => (
            <Tile
              key={image.hash}
              image={image}
              word={word}
              isSelected={selected === image.hash}
              onSelect={() => setSelected(image.hash)}
            />
          ))}
          {placeholders.map((i) => (
            <span key={i} class="ip-tile is-loading" />
          ))}
        </div>
        {/* 切り直しは «今» の画像に対する操作 (候補は確定してから切り直す) */}
        {!isLocked && selected === null && currentImage?.sourceImageUrl ? (
          <div class="ip-tools" role="group" aria-label="今の画像を切り直す">
            <span class="ip-tools-label">切り直す</span>
            {CROP_BUTTONS.map(({ position, label }) => (
              <button
                key={position}
                class="filter-btn"
                type="button"
                disabled={isSaving}
                onClick={() => recrop(position)}
                title={`元画像を${label.replace(/^\S+ /, '')}寄せで切り抜き直す`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <div class="ip-error">{error}</div> : null}
        <div class="ip-foot">
          <button class="filter-btn" type="button" onClick={onClose}>
            閉じる
          </button>
          {isLocked ? (
            <button
              class="filter-btn"
              type="button"
              disabled={isSaving}
              onClick={unlock}
            >
              {isSaving ? '保存中…' : '解除'}
            </button>
          ) : (
            <>
              <button
                class="filter-btn ip-decide"
                type="button"
                disabled={isSaving || (!selected && !currentImage)}
                onClick={decideAndKeep}
                title="選んだ画像 («今» なら今の画像) で確定する。確定した枠は一括の取り直しで上書きされない"
              >
                {isSaving ? '保存中…' : '✓ 確定'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
