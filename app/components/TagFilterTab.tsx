// 番号 > グループ: タグ (出典・作品) ごとに語を見る。
//
// 1. タグ一覧: md カードに正式名・#タグ・語の数と画像 1 枚。よく使うタグほど下 (親指側) に置く。
//    dock の検索欄で作品名でも #タグでも絞れる (タグは id だけでは何の作品か分からない)
// 2. タグを選ぶと、その語を持つ番号を md カードで並べる。画像はそのタグの語のもの
import { h } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { candidatesOf, type Candidate } from '../lib/choice'
import { useNumberContext } from '../lib/numberContext'
import { parseWord, suggestTags, type TagSuggestion } from '../lib/wordTags'
import { NumMdCard, TagMdCard } from './Cells'
import NumDetailPanel from './NumDetailPanel'
import Screen, { DockBar } from './Screen'
import DetailSheet from './DetailSheet'
import { useSelection } from '../lib/useSelection'
import { useBackGuard } from '../lib/useBackGuard'
import { useMdReveal } from '../lib/useMdReveal'
import { MdRevealToggle } from './MdRevealToggle'

type Props = {
  numbers: NumberEntry[]
}

type TagRow = TagSuggestion & {
  count: number
  /** 正式名 (title)。無ければ略称、それも無ければタグの id */
  title: string
  /** カードに出す画像の語 */
  cand: Candidate | undefined
}

/** その番号の、そのタグが付いた語 (複数あれば先頭) */
const taggedCand = (d: NumberEntry, tag: string) =>
  candidatesOf(d).find((cand) => parseWord(cand.word).tags.includes(tag))

/** そのタグの語を持つ番号 */
function numbersWithTag(numbers: NumberEntry[], tag: string): NumberEntry[] {
  return numbers.filter((d) => taggedCand(d, tag) !== undefined)
}

type TagStat = { count: number; cand: Candidate | undefined }

/**
 * 語に付いたタグごとの語の数 (一覧の件数と、選んだあとに並ぶ語の数を揃える) と、
 * カードに出す画像の語 (画像のある語のうち番号がいちばん若いもの)
 */
function tagStats(numbers: NumberEntry[]): Map<string, TagStat> {
  const stats = new Map<string, TagStat>()
  for (const d of numbers)
    for (const cand of candidatesOf(d))
      for (const t of parseWord(cand.word).tags) {
        const prev = stats.get(t)
        stats.set(t, {
          count: (prev?.count ?? 0) + 1,
          cand: prev?.cand ?? (cand.img ? cand : undefined),
        })
      }
  return stats
}

type TagListProps = { rows: TagRow[]; onPick: (tag: string) => void }

// 番号の md カードと同じ並べ方。語の多いタグほど下 (親指側)
function TagList({ rows, onPick }: TagListProps) {
  if (rows.length === 0)
    return <div class="screen-empty">該当するタグがありません</div>
  return (
    <div class="grid-up md-grid" style={{ '--gap': '6px' }}>
      {rows.map((row) => (
        <TagMdCard
          key={row.tag}
          tag={row.tag}
          title={row.title}
          short={row.name}
          count={row.count}
          cand={row.cand}
          onSelect={() => onPick(row.tag)}
        />
      ))}
    </div>
  )
}

function TagFilterTab({ numbers }: Props) {
  const ctx = useNumberContext()
  const tagNames = ctx?.tagNames
  const tagTitles = ctx?.tagTitles
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const allRows = useMemo<TagRow[]>(
    () =>
      [...tagStats(numbers)].map(([t, stat]) => ({
        tag: t,
        name: tagNames?.[t],
        title: tagTitles?.[t] ?? tagNames?.[t] ?? t,
        count: stat.count,
        cand: stat.cand,
      })),
    [numbers, tagNames, tagTitles]
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
  const reveal = useMdReveal()

  const pickTag = (next: string | null) => {
    clear()
    reveal.setMode('num')
    setTag(next)
  }
  // タグを開いた画面で端末の «戻る» を押すとアプリごと閉じていた。
  // 戻るはタグ一覧へ戻す (詳細パネルが開いていれば、そちらが先に閉じる)
  useBackGuard(tag !== null, () => pickTag(null))

  const panel = selectedEntry ? (
    <DetailSheet nav={nav} onClose={clear}>
      <NumDetailPanel d={selectedEntry} />
    </DetailSheet>
  ) : null

  const main = current ? (
    // md カードで、そのタグの語の画像を出す (人・物の先頭ではない)
    <div class="grid-up md-grid" style={{ '--gap': '6px' }}>
      {matched.map((d) => (
        <NumMdCard
          key={d.num}
          num={d.num}
          cand={taggedCand(d, current.tag)}
          // 詳細パネルで前へ / 次へ送った先も開く (パネルに語が出ているので伏せる意味が無い)
          open={reveal.isOpen(d.num) || selected === d.num}
          selected={selected === d.num}
          onSelect={() => {
            reveal.reveal(d.num)
            toggle(d.num)
          }}
        />
      ))}
    </div>
  ) : (
    <TagList rows={rows} onPick={pickTag} />
  )

  const dock = current ? (
    <>
      <MdRevealToggle mode={reveal.mode} onChange={reveal.setMode} />
      <DockBar
        title={current.title}
        sub={`${
          current.name && current.name !== current.title
            ? `${current.name} ・ `
            : ''
        }${matched.length} 番号`}
      >
        <button class="filter-btn" onClick={() => pickTag(null)}>
          タグ一覧へ
        </button>
      </DockBar>
    </>
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
