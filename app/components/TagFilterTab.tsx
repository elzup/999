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
import Screen, { DockBar, DockRow } from './Screen'
import DetailSheet from './DetailSheet'
import { useSelection } from '../lib/useSelection'
import { useBackGuard } from '../lib/useBackGuard'
import { useMdReveal } from '../lib/useMdReveal'
import TagNameForm from './TagNameForm'

type Props = {
  numbers: NumberEntry[]
}

export type TagRow = TagSuggestion & {
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
export function tagStats(numbers: NumberEntry[]): Map<string, TagStat> {
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

type TagListProps = {
  rows: TagRow[]
  onPick: (tag: string) => void
  isMini?: boolean
  selectedTag?: string | null
}

// md カードの小さい版 (チップス)。設定 > タグ とタグ内の表示で共用する
const gridClass = (isMini: boolean) =>
  'grid-up md-grid' + (isMini ? ' md-mini' : '')
const gridGap = (isMini: boolean) => ({ '--gap': isMini ? '4px' : '6px' })

// 番号の md カードと同じ並べ方。語の多いタグほど下 (親指側)
export function TagList({
  rows,
  onPick,
  isMini = false,
  selectedTag = null,
}: TagListProps) {
  if (rows.length === 0)
    return <div class="screen-empty">該当するタグがありません</div>
  return (
    <div class={gridClass(isMini)} style={gridGap(isMini)}>
      {rows.map((row) => (
        <TagMdCard
          key={row.tag}
          tag={row.tag}
          title={row.title}
          short={row.name}
          count={row.count}
          cand={row.cand}
          selected={selectedTag === row.tag}
          onSelect={() => onPick(row.tag)}
        />
      ))}
    </div>
  )
}

// タグを開いた画面の表示。クイズ = 語を伏せる / 一覧 = 全部出す / チップス = 小さいカード
type TagView = 'quiz' | 'list' | 'chips' | 'edit'
const TAG_VIEWS: ReadonlyArray<[TagView, string]> = [
  ['quiz', 'クイズ'],
  ['list', '一覧'],
  ['chips', 'チップス'],
  ['edit', '編集'],
]

function TagFilterTab({ numbers }: Props) {
  const ctx = useNumberContext()
  const tagNames = ctx?.tagNames
  const tagTitles = ctx?.tagTitles
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [view, setViewState] = useState<TagView>('quiz')

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

  const setView = (next: TagView) => {
    clear()
    reveal.setMode(next === 'quiz' ? 'num' : 'all')
    setViewState(next)
  }
  const pickTag = (next: string | null) => {
    setView('quiz')
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

  const isMini = view === 'chips'
  const main = !current ? (
    <TagList rows={rows} onPick={pickTag} />
  ) : view === 'edit' ? (
    <TagNameForm key={current.tag} tag={current.tag} />
  ) : (
    // md カードで、そのタグの語の画像を出す (人・物の先頭ではない)
    <div class={gridClass(isMini)} style={gridGap(isMini)}>
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
  )

  const dock = current ? (
    <>
      <DockRow>
        {TAG_VIEWS.map(([key, label]) => (
          <button
            key={key}
            class={'filter-btn' + (view === key ? ' active' : '')}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </DockRow>
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
