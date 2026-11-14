// 番号 > グループ: タグ (出典・作品) ごとに語を見る。
//
// 1. タグ一覧: 作品名 + #タグ + 語の数。よく使うタグほど下 (親指側) に置く。
//    dock の検索欄で作品名でも #タグでも絞れる (タグは id だけでは何の作品か分からない)
// 2. タグを選ぶと、そのタグが付いた語を画像付きのカードで並べる。
//    番号だけのマスだと «どの語がそのタグか» が開くまで分からないため、語と画像を出す
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { candidatesOf, type Candidate } from '../lib/choice'
import { nameOf } from '../lib/numberDetail'
import { useNumberContext } from '../lib/numberContext'
import { parseWord, suggestTags, type TagSuggestion } from '../lib/wordTags'
import { wordImage } from '../lib/wordImage'
import NumDetailPanel from './NumDetailPanel'
import Screen, { DockBar } from './Screen'
import DetailSheet from './DetailSheet'
import { useSelection } from '../lib/useSelection'

type Props = {
  numbers: NumberEntry[]
}

type TagRow = TagSuggestion & { count: number }

/** タグの付いた語 1 つ (同じ番号に 2 つあれば 2 枚) */
type TaggedWord = { num: string; cand: Candidate }

const CARD_IMG_PX = 72

function wordsWithTag(numbers: NumberEntry[], tag: string): TaggedWord[] {
  return numbers.flatMap((d) =>
    candidatesOf(d)
      .filter((cand) => parseWord(cand.word).tags.includes(tag))
      .map((cand) => ({ num: d.num, cand }))
  )
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

function WordCard({
  item,
  selected,
  onSelect,
}: {
  item: TaggedWord
  selected: boolean
  onSelect: () => void
}) {
  const { num, cand } = item
  return (
    <button
      class={'tw-card' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      {cand.img ? (
        <img
          class="tw-img"
          {...wordImage(cand.img, CARD_IMG_PX, cand.word)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span class="tw-img is-empty" />
      )}
      <span class="tw-num">{num}</span>
      <span class="tw-word">{nameOf(cand.word)}</span>
    </button>
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
  const words = useMemo(
    () => (tag ? wordsWithTag(numbers, tag) : []),
    [numbers, tag]
  )
  const keyOf = (w: TaggedWord) => `${w.num}:${w.cand.slot}`
  const order = useMemo(() => words.map(keyOf), [words])
  const { selected, toggle, clear, nav } = useSelection(order)
  const selectedNum = selected ? selected.split(':')[0] : null
  const selectedEntry = numbers.find((d) => d.num === selectedNum) ?? null

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
    <div class="grid-up tw-grid">
      {words.map((w) => (
        <WordCard
          key={keyOf(w)}
          item={w}
          selected={selected === keyOf(w)}
          onSelect={() => toggle(keyOf(w))}
        />
      ))}
    </div>
  ) : (
    <TagList rows={rows} onPick={pickTag} />
  )

  const dock = current ? (
    <DockBar
      title={current.name ?? `#${current.tag}`}
      sub={`#${current.tag} ・ ${words.length} 語`}
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
