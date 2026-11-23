// 候補タブ 代表 > 悪い順。番号を «語なし → 一番良い語の型が悪い順» に並べ、開くとティアカバーと
// 表から作った良い当て方を出す。語なしの番号も開ける。判定は app/lib/worstRank.ts
import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { useNumberContext } from '../lib/numberContext'
import { useReadingTables } from '../lib/reading'
import {
  patternName,
  readingIdeas,
  worstRows,
  type Graded,
  type WorstRow,
} from '../lib/worstRank'
import TaggedWord from './TaggedWord'
import TierCover from './TierCover'

/** 一度に出す番号の数。1000 件を一度に描くと開くのが重い */
const PAGE = 100

const worstOf = (g: Graded) => patternName(g.ids[g.ids.length - 1] ?? 'double')

function GradeLine({ g, word }: { g: Graded; word?: string }) {
  return (
    <li class="wr-line">
      <span class="wr-no">{g.worst}</span>
      {word ? <TaggedWord word={word} /> : null}
      <span class="wr-kana">{g.kana}</span>
      <span class="wr-rk">{g.rankey}</span>
      <span class="wr-pat">
        {g.ids.map(patternName).join(' · ')} / 格 {g.tier}
      </span>
    </li>
  )
}

function Detail({ row }: { row: WorstRow }) {
  const tables = useReadingTables()
  const ctx = useNumberContext()
  const ideas = useMemo(
    () => (tables ? readingIdeas(tables.rules, row.num) : []),
    [tables, row.num]
  )
  return (
    <div class="wr-detail">
      {row.entry ? <TierCover d={row.entry} /> : null}
      <h4>登録語 (良い順。左の数字は一番悪い型の順位)</h4>
      {row.words.length ? (
        <ul class="wr-lines">
          {row.words.map((w) => (
            <GradeLine key={w.slot + w.word} g={w} word={w.word} />
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

export default function WorstRankView({ numbers }: { numbers: NumberEntry[] }) {
  const rows = useMemo(() => worstRows(numbers), [numbers])
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const empty = rows.filter((row) => !row.words.length).length
  return (
    // 一覧は下から上へ (一番悪い番号が親指側)
    <div class="wr stack-up" style={{ '--stack-gap': '4px' }}>
      <p class="wr-note">
        語なし {empty} 番号が先、次に一番良い語の型が悪い順。人 /
        物は分けない。型の点は仮
      </p>
      <ul class="wr-list stack-up" style={{ '--stack-gap': '4px' }}>
        {rows.slice(0, shown).map((row) => {
          const best = row.words[0]
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
                {best ? (
                  <span class="wr-best">
                    <span class="wr-word">
                      <TaggedWord word={best.word} />
                    </span>
                    <span class="wr-pat">{worstOf(best)}</span>
                  </span>
                ) : (
                  <span class="wr-best none">語なし</span>
                )}
              </button>
              {isOpen ? <Detail row={row} /> : null}
            </li>
          )
        })}
      </ul>
      {shown < rows.length ? (
        <button
          type="button"
          class="filter-btn wr-more"
          onClick={() => setShown((n) => n + PAGE)}
        >
          さらに {Math.min(PAGE, rows.length - shown)} 番号
        </button>
      ) : null}
    </div>
  )
}
