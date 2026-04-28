import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { collectNumberTags } from '../lib/tags'

type Props = {
  numbers: NumberEntry[]
}

function TagPanel({ numbers }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const tags = useMemo(() => collectNumberTags(numbers), [numbers])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((entry) => {
      if (entry.tag.toLowerCase().includes(q)) return true
      return entry.occurrences.some((occ) => occ.base.toLowerCase().includes(q))
    })
  }, [tags, query])

  const selectedTag =
    filtered.find((entry) => entry.tag === selected) ||
    (selected && tags.find((entry) => entry.tag === selected)) ||
    filtered[0] ||
    null

  return (
    <div class="content tag-panel">
      <div class="tag-summary-bar">
        <div class="tag-summary-main">
          <span class="tag-summary-num">{tags.length}</span>
          <span class="tag-summary-label">tags</span>
        </div>
        <div class="tag-summary-sub">
          {filtered.length === tags.length
            ? `${filtered.length}件`
            : `${filtered.length}/${tags.length}件`}
        </div>
      </div>

      <input
        class="search-input"
        type="text"
        placeholder="tag or label で検索"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />

      {filtered.length === 0 ? (
        <div class="tag-empty">該当タグなし</div>
      ) : (
        <>
          <div class="tag-list">
            {filtered.map((entry) => (
              <button
                key={entry.tag}
                class={
                  'tag-row' + (selectedTag?.tag === entry.tag ? ' active' : '')
                }
                onClick={() => setSelected(entry.tag)}
              >
                <span class="tag-name">#{entry.tag}</span>
                <span class="tag-count">{entry.count}</span>
                <span class="tag-meta">
                  人{entry.categories.hito} 物{entry.categories.mono} 念
                  {entry.categories.gainen}
                </span>
              </button>
            ))}
          </div>

          {selectedTag ? (
            <div class="tag-detail-card">
              <div class="tag-detail-head">
                <span class="tag-detail-title">#{selectedTag.tag}</span>
                <span class="tag-detail-sub">
                  {selectedTag.nums.length}番号
                </span>
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
                    <span class="tag-occ-base">{occ.base || occ.value}</span>
                    <span class="tag-occ-raw">{occ.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function labelForCategory(category: 'hito' | 'mono' | 'gainen') {
  if (category === 'hito') return '人'
  if (category === 'mono') return '物'
  return '念'
}

export default TagPanel
