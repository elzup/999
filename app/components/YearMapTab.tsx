import { h } from 'preact'
import { useCallback } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { buildYearMap, getMapBounds } from '../lib/yearMap'
import type { Slot } from '../lib/choice'
import MapView from './MapView'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

function YearMapTab({ numbers, bookmarks, onToggleBm }: Props) {
  const build = useCallback(
    (choices: Record<string, Slot>) => ({
      cells: buildYearMap(numbers, choices),
      bounds: getMapBounds(),
    }),
    [numbers]
  )

  return (
    <MapView
      numbers={numbers}
      bookmarks={bookmarks}
      onToggleBm={onToggleBm}
      build={build}
      hint="2桁数字をタップで詳細・候補切替 ・ 色=年コード"
    />
  )
}

export default YearMapTab
