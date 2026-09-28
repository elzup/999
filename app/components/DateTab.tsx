import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'
import { NumCell } from './NumberTab'
import { buildDateEntries } from '../lib/dateKeys'

type Props = {
  numbers: NumberEntry[]
  dates: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

// 365 日分の日付 → 語。キーは「月 + 日(2桁)」で、1〜9月は num 辞書を共有する。
function DateTab({ numbers, dates, bookmarks, onToggleBm }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const days = useMemo(() => buildDateEntries(numbers, dates), [numbers, dates])

  const selectedDay = useMemo(
    () => (selected === null ? null : days.find((d) => d.key === selected)),
    [days, selected]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div class="sticky-wrap">
        {selectedDay ? (
          <NumDetailPanel
            d={selectedDay.entry}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div class="sticky-empty">
            <span>日付を選択</span>
          </div>
        )}
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div class="num-grid">
          {days.map((d, i) => (
            <>
              {i === 0 || days[i - 1].month !== d.month ? (
                <div class="num-band" key={'m' + d.month}>
                  {d.month}月
                </div>
              ) : null}
              <NumCell
                key={d.key}
                d={d.entry}
                selected={selected === d.key}
                onSelect={() => setSelected(selected === d.key ? null : d.key)}
              />
            </>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DateTab
