import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { collectNumberTags } from '../lib/tags'
import Screen, { DockBar } from './Screen'
import { useLongTagNames } from '../lib/tagNames'
import { kataToHiraText } from '../lib/kanaNotation'
import { TAG_MEANINGS } from '../lib/wordTags'
import TagNameForm from './TagNameForm'

// ひらがなで打ってもカタカナの語・名前に当たるよう、比べる前にそろえる
const fold = (text: string) => kataToHiraText(text).toLowerCase()

// 名前の無いタグは id (#ml 等) を出さず «名前未設定» と出す (id は検索でだけ当てる)
const UNNAMED = '名前未設定'
// 英字だけのキー (#ml 等) は読めないので隠す。日本語のキー (#ジブリ) はそのまま名前として読める
const isReadableKey = (tag: string) => /[^\x00-\x7F]/.test(tag)
const nameOf = (tag: string, names: Record<string, string>) =>
  names[tag] || TAG_MEANINGS[tag] || (isReadableKey(tag) ? tag : UNNAMED)

type Props = {
  numbers: NumberEntry[]
}

function TagPanel({ numbers }: Props) {
  const names = useLongTagNames()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const tags = useMemo(() => collectNumberTags(numbers), [numbers])
  const filtered = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return tags
    return tags.filter((entry) => {
      if (fold(entry.tag).includes(q)) return true
      if (fold(nameOf(entry.tag, names)).includes(q)) return true
      return entry.occurrences.some((occ) => fold(occ.base).includes(q))
    })
  }, [tags, query, names])

  const selectedTag =
    filtered.find((entry) => entry.tag === selected) ||
    (selected && tags.find((entry) => entry.tag === selected)) ||
    filtered[0] ||
    null

  const main =
    filtered.length === 0 ? (
      <div class="tag-empty">該当タグなし</div>
    ) : (
      <div class="tag-list tp-list stack-up" style={{ '--stack-gap': '6px' }}>
        {filtered.map((entry) => (
          <button
            key={entry.tag}
            class={
              'tag-row' + (selectedTag?.tag === entry.tag ? ' active' : '')
            }
            onClick={() => setSelected(entry.tag)}
          >
            <span class="tag-name">{nameOf(entry.tag, names)}</span>
            <span class="tag-count">{entry.count}</span>
            <span class="tag-meta">
              人{entry.categories.hito} 物{entry.categories.mono} 念
              {entry.categories.gainen}
            </span>
          </button>
        ))}
      </div>
    )

  const panel =
    filtered.length > 0 && selectedTag ? (
      <div class="tag-panel-detail tp-detail">
        <div class="tag-detail-card">
          <div class="tag-detail-head">
            <span class="tag-detail-title">
              {nameOf(selectedTag.tag, names)}
            </span>
            <span class="tag-detail-sub">{selectedTag.nums.length}番号</span>
          </div>
          <TagNameForm key={selectedTag.tag} tag={selectedTag.tag} />
          <div class="tag-num-list">
            {selectedTag.nums.map((num) => (
              <span key={num} class="tag-num-chip">
                {num}
              </span>
            ))}
          </div>
          <div class="tag-occ-list">
            {selectedTag.occurrences.map((occ, index) => (
              <div
                key={`${occ.num}-${occ.category}-${index}`}
                class="tag-occ-row"
              >
                <span class="tag-occ-num">{occ.num}</span>
                <span class={'tag-occ-cat ' + occ.category}>
                  {labelForCategory(occ.category)}
                </span>
                <span class="tag-occ-base">{occ.base || occ.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ) : null

  const dock = (
    <>
      <DockBar
        title={`タグ ${tags.length}`}
        sub={
          filtered.length === tags.length
            ? `${filtered.length}件`
            : `${filtered.length}/${tags.length}件`
        }
      />
      <input
        class="search-input"
        type="text"
        placeholder="名前・語で検索 (ひらがな可)"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
    </>
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

function labelForCategory(category: 'hito' | 'mono' | 'gainen') {
  if (category === 'hito') return '人'
  if (category === 'mono') return '物'
  return '念'
}

export default TagPanel
