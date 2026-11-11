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
    (repSlots: Record<string, Slot>) => ({
      cells: buildYearMap(numbers, repSlots),
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
      hundred={0}
      hint="2桁数字をタップで詳細 ・ 色=年コード ・ 絵は代表①"
    />
  )
}

export default YearMapTab
