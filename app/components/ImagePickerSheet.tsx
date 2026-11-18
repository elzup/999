// 画像ピッカーのボトムシート (D-0088: A-1 / B-2 / D-2)。
// 開くと 1 枠の候補を取り、«今» + 候補 5 枚の 3×2 から選んで «これにする» で採用する。
// 検索ワードを直して取り直せる。候補タブと詳細パネルの画像から開く。
//
// 画面の上半分に指を伸ばさない規約 (docs/screen-layout.md) に合わせ、シートは下端に出し、
// 確定・閉じるは最下段に置く。
import { createPortal } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import {
  fetchCandidates,
  pickImage,
  setImageOverride,
  type SlotImage,
} from '../lib/imagePicker'
import { wordImage } from '../lib/wordImage'

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
  onClose: () => void
  onPicked?: (image: SlotImage) => void
}

type Loaded = { query: string; candidates: SlotImage[] }

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
  onClose,
  onPicked,
}: Props) {
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // null は «今» (変えない)
  const [selected, setSelected] = useState<string | null>(null)

  const load = async (typed?: string) => {
    setIsLoading(true)
    setError('')
    setSelected(null)
    try {
      const result = await fetchCandidates({ token, id, slot, query: typed })
      setLoaded({ query: result.query, candidates: result.candidates })
      setQuery(result.query)
    } catch (err) {
      console.error('candidates', id, slot, err)
      setError(String((err as Error).message || err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // 開いた枠の候補を 1 度だけ取る。枠が変わればシートごと作り直される (key)
  }, [])

  const decide = async () => {
    if (!selected) return onClose()
    setIsSaving(true)
    setError('')
    try {
      const image = await pickImage({ token, id, slot, hash: selected })
      setImageOverride(id, slot, image)
      onPicked?.(image)
      onClose()
    } catch (err) {
      console.error('pick', id, slot, err)
      setError(String((err as Error).message || err))
      setIsSaving(false)
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
          <span class="ip-word">{word}</span>
        </div>
        <form
          class="ip-query"
          onSubmit={(e) => {
            e.preventDefault()
            if (!isLoading) load(query.trim() || undefined)
          }}
        >
          <input
            id="ip-query-input"
            type="search"
            value={query}
            placeholder="検索ワード"
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <button class="filter-btn" type="submit" disabled={isLoading}>
            {isLoading ? '検索中…' : '再検索'}
          </button>
        </form>
        <div class="ip-grid">
          <Tile
            image={current}
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
        {error ? <div class="ip-error">{error}</div> : null}
        <div class="ip-foot">
          <button class="filter-btn" type="button" onClick={onClose}>
            閉じる
          </button>
          <button
            class="filter-btn ip-decide"
            type="button"
            disabled={!selected || isSaving}
            onClick={decide}
          >
            {isSaving ? '保存中…' : 'これにする'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
