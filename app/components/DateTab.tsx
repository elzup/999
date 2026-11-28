import { h } from 'preact'
import { useMemo, useRef } from 'preact/hooks'
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

// 4×4 の外周に 12 か月を時計回りに置き、真ん中の 2×2 に年間の輪っかを置く。
//   3  4  5  6
//   2  輪 輪  7
//   1  輪 輪  8
//  12 11 10  9
// 輪っかは左右に割り、左の列の側に 10〜3月、右の列の側に 4〜9月を置く
const MONTH_GRID: ReadonlyArray<
  readonly [month: number, row: number, col: number]
> = [
  [3, 1, 1],
  [4, 1, 2],
  [5, 1, 3],
  [6, 1, 4],
  [2, 2, 1],
  [7, 2, 4],
  [1, 3, 1],
  [8, 3, 4],
  [12, 4, 1],
  [11, 4, 2],
  [10, 4, 3],
  [9, 4, 4],
]

/** mmdd の 4 桁 (0105 等)。1〜9月も 0 を埋めて桁を揃える */
const mmdd = (month: number, day: number) =>
  String(month).padStart(2, '0') + String(day).padStart(2, '0')

const hasWord = (d: Day) => candidatesOf(d.entry).length > 0

// 365 日分の日付 → 語。キーは「月 + 日(2桁)」で、1〜9月は num 辞書を共有する。
function DateTab({ numbers, dates, bookmarks, onToggleBm }: Props) {
  const days = useMemo(() => buildDateEntries(numbers, dates), [numbers, dates])
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

  const jumpTo = (month: number) =>
    monthRefs.current[month]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })

  const panel = selectedDay ? (
    <DetailSheet nav={nav} onClose={() => setSelected(null)}>
      <NumDetailPanel
        d={selectedDay.entry}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
      />
    </DetailSheet>
  ) : null

  const renderMonth = ([month, row, col]: typeof MONTH_GRID[number]) => (
    <div key={month} class="dt-cell" style={{ gridArea: `${row} / ${col}` }}>
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
  )

  // 真ん中の 2×2 は左右に割り、輪っかの左半分 / 右半分をそれぞれの列の側に置く (UI 案 A-3)
  const main = (
    <div class="dt-grid">
      {MONTH_GRID.map(renderMonth)}
      <div class="dt-cell dt-cell--ring" style={{ gridArea: '2 / 2 / 4 / 4' }}>
        <HalfRing side="left" byMonth={byMonth} onJump={jumpTo} />
        <HalfRing side="right" byMonth={byMonth} onJump={jumpTo} />
      </div>
    </div>
  )

  const filled = days.filter(hasWord).length
  const dock = <DockBar title="日付" sub={`${filled} / ${days.length} 日`} />

  return <Screen main={main} panel={panel} dock={dock} />
}

/**
 * 1 か月を 4 列で。1 日を左上に置く (曜日は年で変わるので合わせない)。
 * 4 か月を横に並べるので 7 列だとマスが小さすぎて読めない
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
  const filled = days.filter(hasWord).length
  return (
    <section class="dt-month" ref={refOf}>
      <div class="dt-month-head">
        <span class="dt-month-name">{month}月</span>
        <span class="dt-month-sub">
          {filled}/{days.length}
        </span>
      </div>
      <div class="dt-cal">
        {days.map((d) => {
          const score = d.entry.w1Score ?? d.entry.w2Score
          const color = scoreColor(score)
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
              {mmdd(month, d.day)}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// 輪っかの寸法 (viewBox の単位)。中の穴を大きめにして月の数字を輪の上に読ませる
const RING_SIZE = 120
const RING_OUTER = 56
const RING_INNER = 36

/** 角度 (12 時が 0、時計回り) → 座標 */
const pointAt = (radius: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180
  const center = RING_SIZE / 2
  return [center + radius * Math.cos(rad), center + radius * Math.sin(rad)]
}

/** 月の扇。3 と 4 の境目を 12 時に置き、左半分 (10〜3月) と右半分 (4〜9月) に割れるようにする */
function monthArc(month: number) {
  const start = (month - 4) * 30
  const end = start + 30
  const [x1, y1] = pointAt(RING_OUTER, start)
  const [x2, y2] = pointAt(RING_OUTER, end)
  const [x3, y3] = pointAt(RING_INNER, end)
  const [x4, y4] = pointAt(RING_INNER, start)
  return {
    d: `M${x1} ${y1} A${RING_OUTER} ${RING_OUTER} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${RING_INNER} ${RING_INNER} 0 0 0 ${x4} ${y4}Z`,
    label: pointAt((RING_OUTER + RING_INNER) / 2, start + 15),
  }
}

const HALF_MONTHS = {
  left: [10, 11, 12, 1, 2, 3],
  right: [4, 5, 6, 7, 8, 9],
} as const

/**
 * 1 年の輪っかの半分。月ごとに語の埋まり具合で塗り、押すとその月へ飛ぶ。
 * viewBox で円の片側だけを切り出すので、縦長のマスにそのまま収まる
 */
function HalfRing({
  side,
  byMonth,
  onJump,
}: {
  side: 'left' | 'right'
  byMonth: Map<number, Day[]>
  onJump: (month: number) => void
}) {
  const months = HALF_MONTHS[side]
  const half = RING_SIZE / 2
  const viewBox =
    side === 'left'
      ? `0 0 ${half} ${RING_SIZE}`
      : `${half} 0 ${half} ${RING_SIZE}`
  return (
    <div class="dt-ring">
      <svg viewBox={viewBox} role="list">
        {months.map((month) => {
          const days = byMonth.get(month) ?? []
          const ratio = days.length
            ? days.filter(hasWord).length / days.length
            : 0
          const arc = monthArc(month)
          return (
            <g
              key={month}
              role="listitem"
              class="dt-ring-seg"
              onClick={() => onJump(month)}
            >
              <title>{`${month}月 ${Math.round(ratio * 100)}%`}</title>
              <path d={arc.d} style={{ '--fill': String(ratio) }} />
              <text x={arc.label[0]} y={arc.label[1]}>
                {month}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default DateTab
