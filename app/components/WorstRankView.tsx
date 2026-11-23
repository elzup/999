// 候補タブ 代表 > 悪い順。悪い方から SHOWN 番号だけを出す (1000 番号を並べても見ない)。
// 並び: 語なし → 評価 -1 しか無い → 代表 ①② の良い方 (代表が無ければ一番良い語) の型が悪い順。
// 開くとティアカバーと、表から作った良い当て方を出す。判定は app/lib/worstRank.ts
import { useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { NumberDoc } from '../lib/numberApi'
import { useNumberContext } from '../lib/numberContext'
import { useReadingTables } from '../lib/reading'
import {
  LEVEL,
  patternName,
  readingIdeas,
  worstRows,
  type Graded,
  type GradedWord,
  type WorstRow,
} from '../lib/worstRank'
import TaggedWord from './TaggedWord'
import TierCover from './TierCover'

/** 出す番号の数。直す相手を探す画面なので、悪い方から少しだけ */
const SHOWN = 30
const REP_MARK = ['', '①', '②']

const worstOf = (g: Graded) => patternName(g.ids[g.ids.length - 1] ?? 'double')

function GradeLine({ g, word }: { g: Graded; word?: GradedWord }) {
  return (
    <li class={'wr-line' + (word?.rating === -1 ? ' is-bad' : '')}>
      <span class="wr-no">{g.worst}</span>
      {word ? (
        <>
          {word.repRank ? (
            <span class="wr-rep">{REP_MARK[word.repRank]}</span>
          ) : null}
          <TaggedWord word={word.word} />
          {word.rating === -1 ? <span class="wr-rate">-1</span> : null}
        </>
      ) : null}
      <span class="wr-kana">{g.kana}</span>
      <span class="wr-rk">{g.rankey}</span>
      <span class="wr-pat">
        {g.ids.map(patternName).join(' · ')} / 格 {g.tier}
      </span>
    </li>
  )
}

function Detail({
  row,
  entry,
}: {
  row: WorstRow
  entry: NumberEntry | undefined
}) {
  const tables = useReadingTables()
  const ctx = useNumberContext()
  const ideas = useMemo(
    () => (tables ? readingIdeas(tables.rules, row.num) : []),
    [tables, row.num]
  )
  return (
    <div class="wr-detail">
      {entry ? <TierCover d={entry} /> : null}
      <h4>登録語 (良い順。左の数字は一番悪い型の順位)</h4>
      {row.words.length ? (
        <ul class="wr-lines">
          {row.words.map((w) => (
            <GradeLine key={w.key} g={w} word={w} />
          ))}
        </ul>
      ) : (
        <p class="wr-empty">まだ語がありません</p>
      )}
      <h4>良い当て方 (表から作った読み。語ではない)</h4>
      <ul class="wr-lines">
        {ideas.map((g) => (
          <GradeLine key={g.kana} g={g} />
        ))}
      </ul>
      {ctx ? (
        <button
          type="button"
          class="filter-btn"
          onClick={() => ctx.openEditor(row.num)}
        >
          ✎ 語を編集
        </button>
      ) : null}
    </div>
  )
}

function Summary({ row }: { row: WorstRow }) {
  if (row.level === LEVEL.none) return <span class="wr-best none">語なし</span>
  if (row.level === LEVEL.onlyBad)
    return <span class="wr-best none">評価 -1 の語しか無い</span>
  const basis = row.basis
  if (!basis) return null
  return (
    <span class="wr-best">
      <span class="wr-word">
        {row.fromRep ? REP_MARK[basis.repRank] : '代表なし'}{' '}
        <TaggedWord word={basis.word} />
      </span>
      <span class="wr-pat">{worstOf(basis)}</span>
    </span>
  )
}

export default function WorstRankView({
  docs,
  entries,
  loadedHundreds,
}: {
  /** DB の番号文書 (代表・評価を見る)。百の位 10 個を読み終えるまでは途中の分 */
  docs: NumberDoc[]
  entries: Map<string, NumberEntry>
  loadedHundreds: number
}) {
  const [open, setOpen] = useState<string | null>(null)
  const isLoading = loadedHundreds < 10
  // 親は描くたびに配列を作り直すので、中身の文書が同じなら前の配列を使う
  // (開け閉めのたびに 1000 番号を採点し直さない)
  const stable = useRef<NumberDoc[]>([])
  if (
    docs.length !== stable.current.length ||
    docs.some((doc, i) => doc !== stable.current[i])
  )
    stable.current = docs
  const current = stable.current
  const rows = useMemo(
    () => (isLoading ? [] : worstRows(current).slice(0, SHOWN)),
    [current, isLoading]
  )
  if (isLoading)
    return <div class="screen-empty">読み込み中 {loadedHundreds}/10</div>
  return (
    // 一覧は下から上へ (一番悪い番号が親指側)
    <div class="wr stack-up" style={{ '--stack-gap': '4px' }}>
      <p class="wr-note">
        悪い方から {SHOWN} 番号。語なし → 評価 -1 しか無い → 代表 ①② の良い方
        (代表が無ければ一番良い語) の型が悪い順。型の点は仮
      </p>
      <ul class="wr-list stack-up" style={{ '--stack-gap': '4px' }}>
        {rows.map((row) => {
          const isOpen = open === row.num
          return (
            <li key={row.num} class={'wr-row' + (isOpen ? ' open' : '')}>
              <button
                type="button"
                class="wr-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : row.num)}
              >
                <span class="wr-num">{row.num}</span>
                <Summary row={row} />
              </button>
              {isOpen ? (
                <Detail row={row} entry={entries.get(row.num)} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
