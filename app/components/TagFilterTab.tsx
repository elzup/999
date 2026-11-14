// 番号 > グループ: タグ (出典・作品) ごとに語を見る。
//
// 1. タグ一覧: 作品名 + #タグ + 語の数。よく使うタグほど下 (親指側) に置く。
//    dock の検索欄で作品名でも #タグでも絞れる (タグは id だけでは何の作品か分からない)
// 2. タグを選ぶと、その語を持つ番号を md カードで並べる。画像はそのタグの語のもの
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { candidatesOf } from '../lib/choice'
import { useNumberContext } from '../lib/numberContext'
import { parseWord, suggestTags, type TagSuggestion } from '../lib/wordTags'
import { NumMdCard } from './Cells'
import NumDetailPanel from './NumDetailPanel'
import Screen, { DockBar } from './Screen'
import DetailSheet from './DetailSheet'
import { useSelection } from '../lib/useSelection'

type Props = {
  numbers: NumberEntry[]
}

type TagRow = TagSuggestion & { count: number }

/** その番号の、そのタグが付いた語 (複数あれば先頭) */
const taggedCand = (d: NumberEntry, tag: string) =>
  candidatesOf(d).find((cand) => parseWord(cand.word).tags.includes(tag))

/** そのタグの語を持つ番号 */
function numbersWithTag(numbers: NumberEntry[], tag: string): NumberEntry[] {
  return numbers.filter((d) => taggedCand(d, tag) !== undefined)
}

/** 語に付いたタグごとの語の数 (一覧の件数と、選んだあとに並ぶ語の数を揃える) */
function countTags(numbers: NumberEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of numbers)
    for (const cand of candidatesOf(d))
      for (const t of parseWord(cand.word).tags)
        counts.set(t, (counts.get(t) ?? 0) + 1)
  return counts
}

type TagListProps = { rows: TagRow[]; onPick: (tag: string) => void }

function TagList({ rows, onPick }: TagListProps) {
  if (rows.length === 0)
    return <div class="screen-empty">該当するタグがありません</div>
  return (
    <div class="stack-up tag-list">
      {rows.map((row) => (
        <button key={row.tag} class="tag-row" onClick={() => onPick(row.tag)}>
          <span class="tag-row-name">{row.name ?? `#${row.tag}`}</span>
          {row.name ? <span class="tag-row-id">#{row.tag}</span> : null}
          <span class="tag-row-count">{row.count}</span>
        </button>
      ))}
    </div>
  )
}

function TagFilterTab({ numbers }: Props) {
  const tagNames = useNumberContext()?.tagNames
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const allRows = useMemo<TagRow[]>(
    () =>
      [...countTags(numbers)].map(([t, count]) => ({
        tag: t,
        name: tagNames?.[t],
        count,
      })),
    [numbers, tagNames]
  )
  const rows = useMemo(() => {
    const sorted = [...allRows].sort((a, b) => b.count - a.count)
    if (!query.trim()) return sorted
    // 作品名でも #タグ でも引ける (先頭一致を先に)
    const hits = suggestTags(sorted, query, [], sorted.length)
    return hits.map((hit) => sorted.find((r) => r.tag === hit.tag) as TagRow)
  }, [allRows, query])

  const current = allRows.find((r) => r.tag === tag) ?? null
  const matched = useMemo(
    () => (tag ? numbersWithTag(numbers, tag) : []),
    [numbers, tag]
  )
  const order = useMemo(() => matched.map((d) => d.num), [matched])
  const { selected, toggle, clear, nav } = useSelection(order)
  const selectedEntry = matched.find((d) => d.num === selected) ?? null

  const pickTag = (next: string | null) => {
    clear()
    setTag(next)
  }

  const panel = selectedEntry ? (
    <DetailSheet nav={nav} onClose={clear}>
      <NumDetailPanel d={selectedEntry} />
    </DetailSheet>
  ) : null

  const main = current ? (
    // md カードで、そのタグの語の画像を出す (人・物の先頭ではない)
    <div class="grid-up" style={{ '--cols': 3, '--gap': '6px' }}>
      {matched.map((d) => (
        <NumMdCard
          key={d.num}
          num={d.num}
          cand={taggedCand(d, current.tag)}
          selected={selected === d.num}
          onSelect={() => toggle(d.num)}
        />
      ))}
    </div>
  ) : (
    <TagList rows={rows} onPick={pickTag} />
  )

  const dock = current ? (
    <DockBar
      title={current.name ?? `#${current.tag}`}
      sub={`#${current.tag} ・ ${matched.length} 番号`}
    >
      <button class="filter-btn" onClick={() => pickTag(null)}>
        タグ一覧へ
      </button>
    </DockBar>
  ) : (
    <>
      <DockBar title="タグ" sub={`${rows.length} / ${allRows.length}`} />
      <input
        class="search-input"
        type="search"
        placeholder="作品名か #タグ で検索"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
    </>
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

export default TagFilterTab
