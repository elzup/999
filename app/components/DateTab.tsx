import { h } from 'preact'
import { useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'
import { scoreColor } from './Cells'
import { buildDateEntries, type DateDay } from '../lib/dateKeys'
import { candidatesOf } from '../lib/choice'
import Screen, { DockBar, DockRow } from './Screen'
import { Segmented } from './Segmented'
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
// 外周の並びと輪っかの扇の向きを揃える (999 外の 10〜12月は下の段にまとまる)
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

// 10〜12月は 4 桁 (1005 等) で 999 の番号に属さない。1〜9月は 3 桁で番号の辞書を共有する
const isOutside999 = (month: number) => month >= 10
type Scope = 'all' | 'outside'

const hasWord = (d: Day) => candidatesOf(d.entry).length > 0

// 365 日分の日付 → 語。キーは「月 + 日(2桁)」で、1〜9月は num 辞書を共有する。
function DateTab({ numbers, dates, bookmarks, onToggleBm }: Props) {
  const days = useMemo(() => buildDateEntries(numbers, dates), [numbers, dates])
  const [scope, setScope] = useState<Scope>('all')
  const monthRefs = useRef<Record<number, HTMLElement | null>>({})

  const isShown = (month: number) => scope === 'all' || isOutside999(month)
  const shownDays = useMemo(
    () => days.filter((d) => scope === 'all' || isOutside999(d.month)),
    [days, scope]
  )
  const byMonth = useMemo(() => {
    const map = new Map<number, Day[]>()
    for (const d of days) map.set(d.month, [...(map.get(d.month) ?? []), d])
    return map
  }, [days])
  const order = useMemo(() => shownDays.map((d) => d.key), [shownDays])
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

  // 隠す月は描かない (場所は grid の位置指定で決まるので並びは崩れない)
  const renderMonth = ([month, row, col]: typeof MONTH_GRID[number]) => (
    <div key={month} class="dt-cell" style={{ gridArea: `${row} / ${col}` }}>
      {isShown(month) ? (
        <MonthCalendar
          month={month}
          days={byMonth.get(month) ?? []}
          selected={selected}
          onSelect={(key) => setSelected(selected === key ? null : key)}
          refOf={(el) => {
            monthRefs.current[month] = el
          }}
        />
      ) : null}
    </div>
  )

  const main = (
    <div class="dt-grid">
      {MONTH_GRID.map(renderMonth)}
      <div class="dt-cell dt-cell--ring" style={{ gridArea: '2 / 2 / 4 / 4' }}>
        <YearRing byMonth={byMonth} isShown={isShown} onJump={jumpTo} />
      </div>
    </div>
  )

  const filled = shownDays.filter(hasWord).length
  const dock = (
    <>
      <DockRow>
        <Segmented
          ariaLabel="範囲"
          options={[
            { id: 'all', label: '全部' },
            { id: 'outside', label: '999 外' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </DockRow>
      <DockBar title="日付" sub={`${filled} / ${shownDays.length} 日`} />
    </>
  )

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

/** 月の扇。4 と 5 の境目を 12 時に置く (外周の上の段 3 4 | 5 6 と同じ向き) */
function monthArc(month: number) {
  const start = (month - 5) * 30
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

/** 1 年の輪っか。月ごとに語の埋まり具合で塗り、押すとその月へ飛ぶ */
function YearRing({
  byMonth,
  isShown,
  onJump,
}: {
  byMonth: Map<number, Day[]>
  isShown: (month: number) => boolean
  onJump: (month: number) => void
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  return (
    <div class="dt-ring">
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} role="list">
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
              class={'dt-ring-seg' + (isShown(month) ? '' : ' off')}
              onClick={() => (isShown(month) ? onJump(month) : undefined)}
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
