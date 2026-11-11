import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import {
  HUNDREDS,
  hasHundredLayout,
  buildNumMap,
  getNumMapBounds,
} from '../lib/numMap'
import type { Slot } from '../lib/choice'
import MapView from './MapView'
import Screen from './Screen'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  /** 詳細の «編集»。«全体» と同じく編集タブで開く */
  onEditWord?: (num: string) => void
}

function NumMapTab({ numbers, bookmarks, onToggleBm, onEditWord }: Props) {
  const [hundred, setHundred] = useState<number>(1)

  const build = useCallback(
    (repSlots: Record<string, Slot>) => ({
      cells: buildNumMap(numbers, hundred, repSlots) ?? [],
      bounds: getNumMapBounds(hundred) ?? {
        minX: 0,
        minY: 0,
        cols: 1,
        rows: 1,
      },
    }),
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
      <Screen
        main={
          <div class="screen-empty">
            {hundred}00〜{hundred}99 のマップは未作成です。
          </div>
        }
        dock={selector}
      />
    )
  }

  return (
    <MapView
      key={hundred}
      numbers={numbers}
      bookmarks={bookmarks}
      onToggleBm={onToggleBm}
      build={build}
      hundred={hundred}
      hint={
        hundred === 0
          ? '000〜099 ・ 年マップと同じ配置 ・ 絵は代表①'
          : `${hundred}00〜${hundred}99 ・ 絵は代表①`
      }
      controls={selector}
      onEditWord={onEditWord}
    />
  )
}

export default NumMapTab
