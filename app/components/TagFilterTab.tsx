// 番号 > グループ: タグを選ぶと、その語を持つ番号だけを並べる。
// タグの選択とその絞り込み (検索) は dock に置き、番号の一覧は下から上へ積む。
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { collectNumberTags } from '../lib/tags'
import { NumCell } from './Cells'
import NumDetailPanel from './NumDetailPanel'
import Screen, { DockBar } from './Screen'
import DetailSheet from './DetailSheet'
import { useSelection } from '../lib/useSelection'

type Props = {
  numbers: NumberEntry[]
}

function TagFilterTab({ numbers }: Props) {
  const tags = useMemo(() => collectNumberTags(numbers), [numbers])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const shownTags = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? tags.filter((t) => t.tag.toLowerCase().includes(q)) : tags
  }, [tags, query])

  const current = tags.find((t) => t.tag === tag) ?? null
  const matched = useMemo(() => {
    if (!current) return []
    const nums = new Set(current.nums)
    return numbers.filter((d) => nums.has(d.num))
  }, [numbers, current])

  const order = useMemo(() => matched.map((d) => d.num), [matched])
  const { selected, toggle, clear, nav } = useSelection(order)
  const selectedNum = matched.find((d) => d.num === selected) ?? null

  const panel = selectedNum ? (
    <DetailSheet nav={nav} onClose={clear}>
      <NumDetailPanel d={selectedNum} />
    </DetailSheet>
  ) : null

  const main = current ? (
    <div class="num-grid grid-up">
      {matched.map((d) => (
        <NumCell
          key={d.num}
          d={d}
          selected={selected === d.num}
          onSelect={() => toggle(d.num)}
        />
      ))}
    </div>
  ) : (
    <div class="screen-empty">下のタグを選ぶと、その番号だけを出します</div>
  )

  const dock = (
    <>
      <DockBar
        title={current ? `#${current.tag}` : `${tags.length} タグ`}
        sub={current ? `${matched.length} 番号` : undefined}
      />
      <div class="rp-filters tag-filter-chips">
        {shownTags.map((t) => (
          <button
            key={t.tag}
            class={'rp-seg' + (t.tag === tag ? ' active' : '')}
            onClick={() => {
              clear()
              setTag(t.tag === tag ? null : t.tag)
            }}
          >
            #{t.tag} <span class="tag-count">{t.nums.length}</span>
          </button>
        ))}
      </div>
      <input
        class="search-input"
        type="text"
        placeholder="タグを検索"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
    </>
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

export default TagFilterTab
