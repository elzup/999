import { h } from 'preact'
import { useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'
import { scoreColor } from './Cells'
import { buildDateEntries, type DateDay } from '../lib/dateKeys'
import { candidatesOf } from '../lib/choice'
import Screen, { DockBar, DockRow } from './Screen'
import { useSelection } from '../lib/useSelection'
import DetailSheet from './DetailSheet'

type Props = {
  numbers: NumberEntry[]
  dates: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type Day = DateDay & { entry: NumberEntry }

// 上の輪っかの左半分 (10〜3月) と右半分 (4〜9月) を 1 画面ずつ、1 列で縦に並べる。
// 左は下から上 (10→3)、右は上から下 (4→9) に読むと輪を時計回りに回る (QA-0128 a)
const PAGES: ReadonlyArray<ReadonlyArray<number>> = [
  [3, 2, 1, 12, 11, 10],
  [4, 5, 6, 7, 8, 9],
]
const PAGE_LABELS = ['10〜3月', '4〜9月']
const pageOf = (month: number) => (month >= 4 && month <= 9 ? 1 : 0)

// 10〜12月は 4 桁 (1005 等) で 999 の番号に属さない。1〜9月は 3 桁で番号の辞書を共有する
const isOutside999 = (month: number) => month >= 10
type Scope = 'all' | 'outside'

const hasWord = (d: Day) => candidatesOf(d.entry).length > 0

// 365 日分の日付 → 語。キーは「月 + 日(2桁)」で、1〜9月は num 辞書を共有する。
function DateTab({ numbers, dates, bookmarks, onToggleBm }: Props) {
  const days = useMemo(() => buildDateEntries(numbers, dates), [numbers, dates])
  const [scope, setScope] = useState<Scope>('all')
  const [page, setPage] = useState(0)
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
  // 999 外 (10〜12月) は全部左半分にあるので、左の画面に固定する
  const shownPage = scope === 'outside' ? 0 : page

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

  const jumpTo = (month: number) => {
    setPage(pageOf(month))
    // ページの切り替え (transform) の後に、その月を画面に入れる
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

  // 1 列なので、隠す月は場所も取らない
  const renderMonth = (month: number) =>
    isShown(month) ? (
      <MonthCalendar
        key={month}
        month={month}
        days={byMonth.get(month) ?? []}
        selected={selected}
        onSelect={(key) => setSelected(selected === key ? null : key)}
        refOf={(el) => {
          monthRefs.current[month] = el
        }}
      />
    ) : null

  const main = (
    <div class="dt-root">
      <YearRing
        byMonth={byMonth}
        isShown={isShown}
        page={shownPage}
        onJump={jumpTo}
      />
      <div class="dt-viewport">
        <div
          class="dt-track"
          style={{ transform: `translateX(${-50 * shownPage}%)` }}
        >
          {PAGES.map((months, index) => (
            <div key={index} class="dt-page" aria-hidden={index !== shownPage}>
              {/* 右半分へは右端、左半分へは左端の 1 列を押して切り替える */}
              {index === 1 ? (
                <button
                  class="dt-switch dt-switch--left"
                  aria-label={`${PAGE_LABELS[0]}へ`}
                  onClick={() => setPage(0)}
                >
                  ‹
                </button>
              ) : null}
              <div class="dt-grid">{months.map(renderMonth)}</div>
              {index === 0 && scope === 'all' ? (
                <button
                  class="dt-switch dt-switch--right"
                  aria-label={`${PAGE_LABELS[1]}へ`}
                  onClick={() => setPage(1)}
                >
                  ›
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const filled = shownDays.filter(hasWord).length
  const dock = (
    <>
      <DockRow>
        {(
          [
            ['all', '全部'],
            ['outside', '999 外'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            class={'filter-btn' + (scope === key ? ' active' : '')}
            aria-pressed={scope === key}
            onClick={() => setScope(key)}
          >
            {label}
          </button>
        ))}
      </DockRow>
      <DockBar
        title={`日付 ${PAGE_LABELS[shownPage]}`}
        sub={`${filled} / ${shownDays.length} 日`}
      />
    </>
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

/** 1 か月をカレンダーのように 7 列で。1 日を左上に置く (曜日は年で変わるので合わせない) */
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
              {d.day}
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

/** 月の扇。3 と 4 の境目を 12 時に置く (2 画面を縦につないだ並びと同じ向き) */
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

/** 1 年の輪っか。月ごとに語の埋まり具合で塗り、押すとその月へ飛ぶ */
function YearRing({
  byMonth,
  isShown,
  page,
  onJump,
}: {
  byMonth: Map<number, Day[]>
  isShown: (month: number) => boolean
  page: number
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
          const isOnPage = pageOf(month) === page
          return (
            <g
              key={month}
              role="listitem"
              class={
                'dt-ring-seg' +
                (isOnPage ? ' on-page' : '') +
                (isShown(month) ? '' : ' off')
              }
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
