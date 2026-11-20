// 画像ピッカーのボトムシート (D-0088: A-1 / B-2 / D-2)。
// 開くと 1 枠の候補を取り、«今» + 候補 5 枚の 3×2 から選んで «✓ 確定» で採用してロックする (やり直すときは «解除»)。
// 検索ワードを直して取り直せる。候補タブと詳細パネルの画像から開く。
// 選んだ画像は «⤢ 全体» (または選んだタイルをもう一度押す) で全画面の元画像を出し、
// 切り抜きの寄せ・範囲を確かめて決めてから確定できる (CropEditor)。
//
// 画面の上半分に指を伸ばさない規約 (docs/screen-layout.md) に合わせ、シートは下端に出し、
// 確定・閉じるは最下段に置く。
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cropImageStyle } from '../lib/cropRect'
import {
  fetchCandidates,
  CROP_BUTTONS,
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
import { useTagNames, wordText } from '../lib/tagNames'

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
  onSelect,
}: {
  image: SlotImage | null
  word: string
  label?: string
  /** 決めた切り抜き (確定前)。元画像で範囲だけ見せる */
  crop?: CropChoice
  isSelected: boolean
  onSelect: () => void
}) {
  const rect = crop && 'rect' in crop ? crop.rect : null
  return (
    <button
      type="button"
      class={'ip-tile' + (isSelected ? ' is-selected' : '')}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      {image && rect && image.sourceImageUrl ? (
        <img
          src={image.sourceImageUrl}
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
  // 確定済みの枠は候補を取らない (Function も断る)。解除すると選び直せる
  const [isLocked, setIsLocked] = useState(kept === true)
  // 開いたときに確定済みかを確かめている間 (詳細パネルからは確定済みかが分からない)。
  // 分かるまで検索は押せない (押してから «ロック中» で断られないように)
  const [isChecking, setIsChecking] = useState(kept === undefined)
  // 上寄せで切り抜き直したら «今» の画像が変わる
  const [currentImage, setCurrentImage] = useState(current)
  // 開いた瞬間から検索ワードを出す (サーバが決めた検索ワードが返ってきたら差し替える)
  // 検索は必ず正式名 (tagTitles = シートの title) で展開する。表示用の略称 (tagNames) は使わない。
  // 正式名の無いタグは id のまま (略称で探すと別のものが出る)
  const tagMap = useNumberContext()?.tagTitles ?? {}
  const tagNames = useTagNames()
  // 語から作った検索ワード。自動の検索でもこれを送る (Function が古くても展開済みの語で探す)
  const autoQuery = buildSearchWord(word, tagMap)
  const [query, setQuery] = useState(autoQuery)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [searching, setSearching] = useState<Searching | null>(null)
  const [isStopped, setIsStopped] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // null は «今» (変えない)
  const [selected, setSelected] = useState<string | null>(null)
  // 選んだ画像の切り抜き (確定のときに切り抜き直す)。null は今の切り抜き (自動) のまま
  const [crop, setCrop] = useState<CropChoice>(null)
  const [isEditing, setIsEditing] = useState(false)
  const stopRef = useRef<AbortController | null>(null)
  // 検索中に検索ワードを打ち始めたら、返ってきた検索ワードで上書きしない
  const isEditedRef = useRef(false)
  const isLoading = searching !== null

  /**
   * typed を省くと語から (サーバがタグの最新の正式名で) 検索ワードを作る。
   * reuseOnly は前に取った候補を出すだけで、検索はしない (開いただけで検索の回数を使わない)
   */
  const load = async (typed?: string, reuseOnly = false) => {
    const stop = new AbortController()
    stopRef.current = stop
    // 前に取った候補を出すだけ (検索しない) のときは «検索中» を出さない
    if (reuseOnly) setIsChecking(true)
    else
      setSearching({
        query: typed ?? query,
        isAuto: typed === undefined,
        startedAt: Date.now(),
      })
    setIsStopped(false)
    isEditedRef.current = false
    setError('')
    setSelected(null)
    setCrop(null)
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
      // 前に取った候補が無い・今の検索ワードと違う (タグを展開できなかった頃の候補) ときは、
      // 何も出さずに待つ。検索は «検索» を押したときだけ
      // 正本の今の画像 (元画像 URL つき)。詳細パネルは配信データの URL しか持たないので、
      // これで全画面の切り抜きを開けるようにする
      if (result.current) setCurrentImage(result.current)
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
        setIsChecking(false)
      }
    }
  }

  useEffect(() => {
    // 開いただけでは検索しない (検索の回数を使わない)。確定済みかを確かめ、
    // 前に取った候補が残っていればそれを出す (確定済みなら Function が断るので、それで分かる)
    if (!isLocked) load(undefined, true)
    // 閉じたら待つのをやめる
    return () => stopRef.current?.abort()
  }, [])

  /** 失敗を出して、押せる状態に戻す */
  const failed = (label: string, err: unknown) => {
    console.error(label, id, slot, err)
    setError(String((err as Error).message || err))
    setIsSaving(false)
  }

  /**
   * 選んだ画像 («今» なら今の画像) で確定して閉じる。切り抜きを決めていれば、採用してから
   * その範囲で切り抜き直す (/console/recrop は今の画像の元画像を切り抜く)。
   * 確定済みの枠は、切り抜きを決めていれば外してから切り抜き直して確定し直す
   * (Function はロック中の枠の切り抜き直しを断る。いちいち «解除» を押さなくてよいように)
   */
  const decideAndKeep = async (choice: CropChoice = crop) => {
    if (isLocked && !choice) return onClose()
    setIsSaving(true)
    setError('')
    let isUnlocked = false
    try {
      if (isLocked) {
        await setKeep({ token, id, slot, on: false })
        isUnlocked = true
      }
      const adopt = (image: SlotImage) => {
        setCurrentImage(image)
        setImageOverride(id, slot, image)
        onPicked?.(image)
      }
      if (selected) {
        adopt(await pickImage({ token, id, slot, hash: selected }))
        // 採用した画像は «今» になる (切り抜きで失敗しても、もう一度は «今» の切り抜き直し)
        setSelected(null)
      }
      if (choice)
        adopt(
          await recropImage({
            token,
            id,
            slot,
            ...('rect' in choice
              ? { rect: choice.rect }
              : { position: choice.position }),
          })
        )
      await setKeep({ token, id, slot, on: true })
      onKeep?.(true)
      onClose()
    } catch (err) {
      // 外したまま失敗した。画面も «未確定» に揃える (もう一度 «✓ 確定» を押せる)
      if (isUnlocked) {
        setIsLocked(false)
        onKeep?.(false)
      }
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
    } catch (err) {
      failed('unkeep', err)
    }
  }

  const candidates = loaded?.candidates.slice(0, SHOWN_CANDIDATES) ?? []
  const selectedImage = selected
    ? (candidates.find((c) => c.hash === selected) ?? null)
    : currentImage
  // 確定済みでも切り抜きは見て直せる (確定のときに外して切り抜き直し、確定し直す)
  const canEdit = Boolean(selectedImage?.sourceImageUrl)
  const select = (hash: string | null) => {
    // 選んだタイルをもう一度押すと全画面で切り抜きを見る
    if (hash === selected) {
      if (canEdit) setIsEditing(true)
      return
    }
    setSelected(hash)
    setCrop(null)
  }
  const placeholders = isLoading
    ? Array.from({ length: SHOWN_CANDIDATES }, (_, i) => i)
    : []

  return createPortal(
    <div class="ip-root">
      <div class="ip-shade" onClick={onClose} />
      <div
        class="ip-sheet"
        role="dialog"
        aria-label={`${id} ${wordText(word, tagNames)} の画像を選ぶ`}
      >
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
            if (isLoading || isLocked || isChecking) return
            // 語から作った検索ワードのままなら «自動» として送る (Function がタグの最新の正式名で作り直す)
            const typed = query.trim()
            load(typed && typed !== autoQuery ? typed : undefined)
          }}
        >
          <input
            id="ip-query-input"
            type="search"
            value={query}
            placeholder="検索ワード"
            disabled={isLocked}
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
              disabled={isLocked || isChecking}
              title={isLocked ? '確定済みの枠は検索できません' : undefined}
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
        ) : isLocked ? (
          <div class="ip-status-note">
            確定済みの枠です。検索はできません (切り抜きは直せます)
          </div>
        ) : loaded?.reused ? (
          <div class="ip-status-note">
            前に取った候補です。«再検索» で新しく探せます
          </div>
        ) : isChecking ? (
          <div class="ip-status-note">確定済みかを確かめています…</div>
        ) : !loaded ? (
          <div class="ip-status-note">
            検索ワードを確かめて «検索» を押すと候補を探します
          </div>
        ) : null}
        <div class="ip-grid">
          <Tile
            image={currentImage}
            word={word}
            label="今"
            crop={selected === null ? crop : undefined}
            isSelected={selected === null}
            onSelect={() => select(null)}
          />
          {candidates.map((image) => (
            <Tile
              key={image.hash}
              image={image}
              word={word}
              crop={selected === image.hash ? crop : undefined}
              isSelected={selected === image.hash}
              onSelect={() => select(image.hash)}
            />
          ))}
          {placeholders.map((i) => (
            <span key={i} class="ip-tile is-loading" />
          ))}
        </div>
        {/* 選んだ画像の元画像を全画面で出して、切り抜きの寄せ・範囲を確かめて決める */}
        {canEdit ? (
          <div class="ip-tools">
            <span class="ip-tools-label">
              切り抜き: {crop ? cropLabel(crop) : '自動'}
            </span>
            <button
              class="filter-btn"
              type="button"
              disabled={isSaving}
              onClick={() => setIsEditing(true)}
              title="元画像を全画面で出して、切り抜く範囲を確かめて決める"
            >
              ⤢ 全体を見て寄せる
            </button>
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
              {isSaving && !crop ? '保存中…' : '解除'}
            </button>
          ) : null}
          {!isLocked || crop ? (
            <>
              <button
                class="filter-btn ip-decide"
                type="button"
                disabled={isSaving || (!selected && !currentImage)}
                onClick={() => decideAndKeep()}
                title="選んだ画像 («今» なら今の画像) で確定する。確定した枠は一括の取り直しで上書きされない"
              >
                {isSaving ? '保存中…' : '✓ 確定'}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {isEditing && selectedImage ? (
        <CropEditor
          image={selectedImage}
          id={id}
          word={word}
          choice={crop}
          isSaving={isSaving}
          onCancel={() => setIsEditing(false)}
          onApply={(choice) => {
            setCrop(choice)
            setIsEditing(false)
          }}
          onDecide={(choice) => {
            setCrop(choice)
            decideAndKeep(choice)
          }}
        />
      ) : null}
    </div>,
    document.body
  )
}
