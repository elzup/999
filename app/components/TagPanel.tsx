import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { collectNumberTags } from '../lib/tags'
import Screen, { DockBar } from './Screen'
import { useTagLabel } from '../lib/tagNames'
import TaggedWord from './TaggedWord'

type Props = {
  numbers: NumberEntry[]
}

function TagPanel({ numbers }: Props) {
  const label = useTagLabel()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const tags = useMemo(() => collectNumberTags(numbers), [numbers])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((entry) => {
      if (entry.tag.toLowerCase().includes(q)) return true
      if (label.short(entry.tag).toLowerCase().includes(q)) return true
      if (label.title(entry.tag).toLowerCase().includes(q)) return true
      return entry.occurrences.some((occ) => occ.base.toLowerCase().includes(q))
    })
  }, [tags, query, label.names, label.titles])

  const selectedTag =
    filtered.find((entry) => entry.tag === selected) ||
    (selected && tags.find((entry) => entry.tag === selected)) ||
    filtered[0] ||
    null

  const main =
    filtered.length === 0 ? (
      <div class="tag-empty">該当タグなし</div>
    ) : (
      <div class="tag-list stack-up" style={{ '--stack-gap': '6px' }}>
        {filtered.map((entry) => (
          <button
            key={entry.tag}
            class={
              'tag-row' + (selectedTag?.tag === entry.tag ? ' active' : '')
            }
            onClick={() => setSelected(entry.tag)}
          >
            <span class="tag-name">{label.short(entry.tag)}</span>
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
      <div class="tag-panel-detail">
        <div class="tag-detail-card">
          <div class="tag-detail-head">
            <span class="tag-detail-title">{label.title(selectedTag.tag)}</span>
            <span class="tag-detail-sub">{selectedTag.nums.length}番号</span>
          </div>
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
                <span class="tag-occ-base">
                  {/* "#b" だけの項目は直前の語の続き (parseTaggedItems の省略記法) */}
                  <TaggedWord
                    word={
                      occ.value.startsWith('#')
                        ? `${occ.base}${occ.value}`
                        : occ.value
                    }
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ) : null

  const dock = (
    <>
      <DockBar
        title={`${tags.length} tags`}
        sub={
          filtered.length === tags.length
            ? `${filtered.length}件`
            : `${filtered.length}/${tags.length}件`
        }
      />
      <input
        class="search-input"
        type="text"
        placeholder="タグ・作品名・語で検索"
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
