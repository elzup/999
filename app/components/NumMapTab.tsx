import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { getMapBounds } from '../lib/yearMap'
import {
  HUNDREDS,
  HUNDRED_LAYOUTS,
  hasHundredLayout,
  buildNumMap,
} from '../lib/numMap'
import type { Slot } from '../lib/choice'
import MapView from './MapView'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

function NumMapTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [hundred, setHundred] = useState<number>(1)

  const build = useCallback(
    (choices: Record<string, Slot>) => {
      const layout = HUNDRED_LAYOUTS[hundred]
      return {
        cells: buildNumMap(numbers, hundred, choices) ?? [],
        bounds: layout
          ? getMapBounds(layout)
          : { minX: 0, minY: 0, cols: 1, rows: 1 },
      }
    },
    [numbers, hundred]
  )

  const selector = (
    <div class="num-map-sel">
      {HUNDREDS.map((hod) => (
        <button
          key={hod}
          class={
            'num-map-sel-btn' +
            (hod === hundred ? ' active' : '') +
            (hasHundredLayout(hod) ? '' : ' empty')
          }
          onClick={() => setHundred(hod)}
        >
          {hod}00
        </button>
      ))}
    </div>
  )

  if (!hasHundredLayout(hundred)) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {selector}
        <div class="content" style={{ padding: 24, color: 'var(--text2)' }}>
          {hundred}00〜{hundred}99 のマップは未作成です。
        </div>
      </div>
    )
  }

  return (
    <MapView
      key={hundred}
      numbers={numbers}
      bookmarks={bookmarks}
      onToggleBm={onToggleBm}
      build={build}
      hint={`${hundred}00〜${hundred}99 ・ 数字をタップで詳細・候補切替`}
      controls={selector}
    />
  )
}

export default NumMapTab
