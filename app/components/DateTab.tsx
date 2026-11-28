import { h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'
import { scoreColor } from './Cells'
import { buildDateEntries, type DateDay } from '../lib/dateKeys'
import { candidatesOf } from '../lib/choice'
import Screen, { DockBar } from './Screen'
import { useSelection } from '../lib/useSelection'
import DetailSheet from './DetailSheet'

type Props = {
  numbers: NumberEntry[]
  dates: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type Day = DateDay & { entry: NumberEntry }

// 4×4-2×2 ドーナッツ配置 (elzup のリング配置の 1 つ)。4×4 の外周に 12 か月を時計回りに置き、
// 真ん中の 2×2 を穴にする。それを真ん中で切って左右 2 画面にする (プレビュー date-layouts の A)。
// ほかの配置 (十字 / ジグザグ 4×3) は https://github.com/elzup/time/blob/main/docs/ring-layout.md
//   3  4 |  5  6
//   2  ◎ |  ◎  7
//   1  ◎ |  ◎  8
//  12 11 | 10  9
type Side = 'left' | 'right'
type Page = {
  side: Side
  label: string
  /** [月, 段, 列] */
  months: ReadonlyArray<readonly [number, number, number]>
}
const PAGES: readonly [Page, Page] = [
  {
    side: 'left',
    label: '10〜3月',
    months: [
      [3, 1, 1],
      [4, 1, 2],
      [2, 2, 1],
      [1, 3, 1],
      [12, 4, 1],
      [11, 4, 2],
    ],
  },
  {
    side: 'right',
    label: '4〜9月',
    months: [
      [5, 1, 1],
      [6, 1, 2],
      [7, 2, 2],
      [8, 3, 2],
      [10, 4, 1],
      [9, 4, 2],
    ],
  },
]
const pageOf = (month: number) =>
  PAGES[0].months.some(([m]) => m === month) ? 0 : 1

/** 日のマスの番号。1〜9月は 999 の 3 桁 (801)、10〜12月は 4 桁 (1001) */
const dayLabel = (month: number, day: number) =>
  `${month}${String(day).padStart(2, '0')}`

const hasWord = (d: Day) => candidatesOf(d.entry).length > 0

// 365 日分の日付 → 語。キーは「月 + 日(2桁)」で、1〜9月は num 辞書を共有する。
function DateTab({ numbers, dates, bookmarks, onToggleBm }: Props) {
  const days = useMemo(() => buildDateEntries(numbers, dates), [numbers, dates])
  const [page, setPage] = useState(0)
  const monthRefs = useRef<Record<number, HTMLElement | null>>({})

  const byMonth = useMemo(() => {
    const map = new Map<number, Day[]>()
    for (const d of days) map.set(d.month, [...(map.get(d.month) ?? []), d])
    return map
  }, [days])
  const order = useMemo(() => days.map((d) => d.key), [days])
  const {
    selected,
    select: setSelected,
    nav,
  } = useSelection(order, (key) => {
    const day = days.find((d) => d.key === key)
    return day ? `${day.month}/${day.day}` : key
  })
  const selectedDay = useMemo(
    () => (selected === null ? null : days.find((d) => d.key === selected)),
    [days, selected]
  )
  // 詳細パネルで前へ / 次へ送って反対の画面の月に入ったら、その画面へ移る
  useEffect(() => {
    if (selectedDay) setPage(pageOf(selectedDay.month))
  }, [selectedDay])

  const jumpTo = (month: number) => {
    setPage(pageOf(month))
    // 画面の切り替え (transform) の後に、その月を画面に入れる
    requestAnimationFrame(() =>
      monthRefs.current[month]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    )
  }

  const panel = selectedDay ? (
    <DetailSheet nav={nav} onClose={() => setSelected(null)}>
      <NumDetailPanel
        d={selectedDay.entry}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
      />
    </DetailSheet>
  ) : null

  const renderPage = (p: Page, index: number) => (
    <div key={p.side} class="dt-page" aria-hidden={index !== page}>
      {p.months.map(([month, row, col]) => (
        <div
          key={month}
          class="dt-cell"
          style={{ gridArea: `${row} / ${col}` }}
        >
          <MonthCalendar
            month={month}
            days={byMonth.get(month) ?? []}
            selected={selected}
            onSelect={(key) => setSelected(selected === key ? null : key)}
            refOf={(el) => {
              monthRefs.current[month] = el
            }}
          />
        </div>
      ))}
      <CenterBlock
        page={p}
        onJump={jumpTo}
        onSwitch={() => setPage(index === 0 ? 1 : 0)}
      />
    </div>
  )

  const main = (
    <div class="dt-viewport">
      <div class="dt-track" style={{ transform: `translateX(${-50 * page}%)` }}>
        {PAGES.map(renderPage)}
      </div>
    </div>
  )

  const dock = <DockBar title="日付" sub={PAGES[page].label} />

  return <Screen main={main} panel={panel} dock={dock} />
}

/**
 * 1 か月を 5 列で。月の名前は見出しの行を作らず最初のマスに置く (縦の余白を減らす)。
 * 名前 + 29〜31 日 = 30〜32 マスなので、どの月も 7 段に揃い左右・上下で高さがずれない。
 * 1 日を名前の次に置く (曜日は年で変わるので合わせない)
 */
function MonthCalendar({
  month,
  days,
  selected,
  onSelect,
  refOf,
}: {
  month: number
  days: Day[]
  selected: string | null
  onSelect: (key: string) => void
  refOf: (el: HTMLElement | null) => void
}) {
  return (
    <section class="dt-month" ref={refOf} aria-label={`${month}月`}>
      <div class="dt-cal">
        <div class="dt-month-name">{month}月</div>
        {days.map((d) => {
          const color = scoreColor(d.entry.w1Score ?? d.entry.w2Score)
          return (
            <button
              key={d.key}
              class={
                'dt-day' +
                (selected === d.key ? ' selected' : '') +
                (hasWord(d) ? '' : ' empty')
              }
              style={color ? { borderColor: color } : undefined}
              aria-label={`${month}月${d.day}日`}
              onClick={() => onSelect(d.key)}
            >
              {dayLabel(month, d.day)}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// 穴のブロックの縁に置く月の帯。その月がある側の縁に置き、押すとその月へ飛ぶ。
// 反対の画面側の縁は切替ボタンにするので帯を置かない
const BANDS: Record<Side, ReadonlyArray<readonly [number, string]>> = {
  left: [
    [3, 'b-t1'],
    [4, 'b-t2'],
    [2, 'b-s1'],
    [1, 'b-s2'],
    [12, 'b-b1'],
    [11, 'b-b2'],
  ],
  right: [
    [5, 'b-t1'],
    [6, 'b-t2'],
    [7, 'b-s1'],
    [8, 'b-s2'],
    [10, 'b-b1'],
    [9, 'b-b2'],
  ],
}

/** ドーナッツの穴。縁に 6 か月の帯、反対の画面に近い端に切替ボタン */
function CenterBlock({
  page,
  onJump,
  onSwitch,
}: {
  page: Page
  onJump: (month: number) => void
  onSwitch: () => void
}) {
  const isLeft = page.side === 'left'
  return (
    <div
      class={'dt-hole dt-hole--' + page.side}
      style={{ gridArea: isLeft ? '2 / 2 / 4 / 3' : '2 / 1 / 4 / 2' }}
    >
      {BANDS[page.side].map(([month, area]) => (
        <button
          key={month}
          class={'dt-band' + (area.startsWith('b-s') ? ' dt-band--v' : '')}
          style={{ gridArea: area }}
          onClick={() => onJump(month)}
        >
          {month}月
        </button>
      ))}
      {/* 中身は未定 (QA-0130 の続き)。今は範囲の名前だけ */}
      <div class="dt-hole-body">{page.label}</div>
      <button
        class="dt-hole-switch"
        aria-label={isLeft ? '4〜9月の画面へ' : '10〜3月の画面へ'}
        onClick={onSwitch}
      >
        {isLeft ? '›' : '‹'}
      </button>
    </div>
  )
}

export default DateTab
